import { Client, Events, GatewayIntentBits, type Guild } from "discord.js";
import { DiscordApiClient } from "./api-client.js";
import {
  loadRuntimeConfig,
  readBotToken,
  type RuntimeConfig,
} from "./config.js";
import { DiscordGuildAdapter } from "./discord-adapter.js";
import type { ObservedGuild } from "./provisioning.js";
import {
  CommandRouter,
  type AuditEvent,
  type BotServices,
} from "./runtime/command.js";
import {
  handleInteraction,
  handleMessage,
} from "./runtime/discord-bindings.js";
import { HealthMonitor, startHealthServer } from "./runtime/health.js";
import { createLogger, type Logger } from "./runtime/logger.js";
import { commands } from "./runtime/registry.js";
import { embed } from "./panels.js";
import { HoneypotTracker } from "./moderation/honeypot.js";
import {
  DiscordMemberGateway,
  backfillAcceptances,
  onMemberJoin,
  onMemberLeave,
  onMemberUpdate,
} from "./automation/membership.js";
import { RoleSyncWorker } from "./automation/role-sync.js";
import {
  NotificationWorker,
  PERMANENT_DISCORD_ERRORS,
  type SendResult,
} from "./automation/notifications.js";
import { DiscordAPIError } from "discord.js";
import { ApplicationChannels } from "./automation/applications.js";
import { ndaPrompt } from "./automation/nda.js";
import { DiscordTicketChannels } from "./tickets/discord-tickets.js";
import { configuredRoleId } from "./blueprint.js";
import { TicketManager } from "./tickets/manager.js";

/** Exit code for configuration errors; the supervisor will not restart on it. */
export const EXIT_CONFIG = 78;

const requireSecret = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32)
    throw Object.assign(
      new Error(`${name} must contain at least 32 characters`),
      {
        exitCode: EXIT_CONFIG,
      },
    );
  return value;
};

const isDisallowedIntents = (error: unknown) =>
  error instanceof Error && /disallowed intents/i.test(error.message);

/**
 * Logs in, preferring the Message Content intent for `!` commands. If the
 * intent is not enabled in the Developer Portal, Discord closes with 4014;
 * the bot then runs with slash commands and buttons only and says so.
 */
async function connect(
  token: string,
  wantPrefix: boolean,
  health: HealthMonitor,
  log: Logger,
): Promise<Client> {
  const base = [GatewayIntentBits.Guilds];
  // Privileged: Server Members (join/leave/role automation) and Message
  // Content (`!` commands). Both are enabled in the Developer Portal.
  const prefix = [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ];
  if (wantPrefix) {
    const client = new Client({ intents: [...base, ...prefix] });
    try {
      await client.login(token);
      health.prefixCommands(true);
      health.memberEvents(true);
      return client;
    } catch (error) {
      await client.destroy();
      if (!isDisallowedIntents(error)) throw error;
      log.warn("gateway.intent.disallowed", {
        intent: "GuildMembers/MessageContent",
        action:
          "Enable Server Members and Message Content intents in the Discord Developer Portal → Bot.",
      });
    }
  }
  const client = new Client({ intents: base });
  await client.login(token);
  health.prefixCommands(
    false,
    wantPrefix
      ? "Message Content intent is not enabled in the Developer Portal"
      : "disabled by KUSH_PREFIX_COMMANDS=false",
  );
  return client;
}

function auditSink(client: Client, config: RuntimeConfig, log: Logger) {
  const channelId = config.channelIds["staff:bot-log"];
  return (event: AuditEvent) => {
    log.info("audit", { ...event });
    if (!channelId) return;
    const channel = client.channels.cache.get(channelId);
    if (!channel?.isSendable()) return;
    void channel
      .send({
        embeds: [
          embed(
            event.action,
            [
              `Actor: <@${event.actorId}>`,
              `Outcome: ${event.outcome}`,
              ...Object.entries(event.detail ?? {}).map(
                ([key, value]) => `${key}: ${value}`,
              ),
            ].join("\n"),
          ),
        ],
        allowedMentions: { parse: [] },
      })
      .catch((error: unknown) =>
        log.warn("audit.post.failed", {
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
  };
}

export async function startBot(): Promise<{
  client: Client;
  stop: () => Promise<void>;
}> {
  const log = createLogger();
  const config = await loadRuntimeConfig().catch((error: unknown) => {
    throw Object.assign(
      new Error(
        `Invalid Discord configuration: ${error instanceof Error ? error.message : "unknown"}`,
      ),
      { exitCode: EXIT_CONFIG },
    );
  });
  const componentSecret = requireSecret("KUSH_COMPONENT_SECRET");
  const integrationSecret = requireSecret("KUSH_DISCORD_INTEGRATION_SECRET");
  const health = new HealthMonitor(config.guildId);
  const api = new DiscordApiClient({
    baseUrl: config.apiBaseUrl,
    tenantId: config.supportTenantId,
    guildId: config.guildId,
    integrationSecret,
  });

  const client = await connect(
    await readBotToken(),
    process.env.KUSH_PREFIX_COMMANDS !== "false",
    health,
    log,
  );

  const guild = (): Guild => {
    const found = client.guilds.cache.get(config.guildId);
    if (!found)
      throw new Error("The configured guild is not available to the bot");
    return found;
  };
  let observedCache: { at: number; value: ObservedGuild } | undefined;
  const tickets = new TicketManager(
    new DiscordTicketChannels(guild),
    api,
    {
      guildId: config.guildId,
      botRoleId: () =>
        client.guilds.cache.get(config.guildId)?.members.me?.roles.botRole?.id,
      roleIds: config.roleIds,
      channelIds: config.channelIds,
    },
    log,
  );
  const services: BotServices = {
    config,
    componentSecret,
    health,
    log,
    api,
    tickets,
    now: Date.now,
    audit: auditSink(client, config, log),
    observeGuild: async () => {
      if (observedCache && observedCache.at > Date.now() - 30_000)
        return observedCache.value;
      const value = await new DiscordGuildAdapter(guild()).observe();
      observedCache = { at: Date.now(), value };
      return value;
    },
    memberRoleIds: async (userId) => {
      // A member fetch can hang (no GuildMembers intent, or rate limiting),
      // so bound it rather than leaving the command waiting forever.
      const member = await Promise.race([
        guild()
          .members.fetch(userId)
          .catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
      return member ? [...member.roles.cache.keys()] : null;
    },
  };
  const router = new CommandRouter(commands);
  const honeypot = new HoneypotTracker();
  const dependencies = { router, services, honeypot };

  // ------------------------------------------------- membership automation
  const roleIds = () => ({
    member: configuredRoleId(config.roleIds, "member"),
    verifiedCustomer: configuredRoleId(config.roleIds, "verified-customer"),
    restricted: configuredRoleId(config.roleIds, "restricted"),
  });
  const roleSync = new RoleSyncWorker(
    api,
    new DiscordMemberGateway(guild),
    roleIds,
    log,
  );
  health.roleSync(() => ({ ...roleSync.stats }));
  const kick = () =>
    void roleSync.tick().catch((error: unknown) =>
      log.warn("roles.tick.failed", {
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  services.kickRoleSync = kick;

  // ------------------------------------------- website -> Discord outbox
  // Permanent Discord errors (DMs closed, channel deleted) are reported as
  // undeliverable so they are not retried; anything else is retried.
  const deliver = async (
    send: () => Promise<SendResult | void>,
  ): Promise<SendResult> => {
    try {
      return (await send()) ?? "sent";
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        typeof error.code === "number" &&
        PERMANENT_DISCORD_ERRORS.has(error.code)
      )
        return "undeliverable";
      throw error;
    }
  };
  const noMentions = { parse: [] as never[] };
  const applications = new ApplicationChannels(
    api,
    new DiscordTicketChannels(guild),
    {
      guildId: config.guildId,
      botRoleId: () =>
        client.guilds.cache.get(config.guildId)?.members.me?.roles.botRole?.id,
      roleIds: config.roleIds,
      channelIds: config.channelIds,
    },
    log,
  );
  services.applications = applications;
  await applications
    .load()
    .then((count) => log.info("applications.channels.loaded", { count }))
    .catch((error: unknown) =>
      log.warn("applications.channels.load_failed", {
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  const notifications = new NotificationWorker(
    api,
    {
      sendToChannel: (channelId, content) =>
        deliver(async () => {
          const channel = await guild().channels.fetch(channelId);
          if (!channel?.isTextBased()) return "undeliverable";
          await channel.send({ content, allowedMentions: noMentions });
        }),
      createApplicationChannel: (input) =>
        deliver(async () => {
          // Not in the server: Discord rejects a member overwrite for them.
          // Throws Unknown Member (permanent); the website flow still works.
          await guild().members.fetch(input.applicantDiscordId);
          await applications.create(input);
        }),
      sendNdaPrompt: (delivery) =>
        deliver(async () => {
          const message = {
            ...ndaPrompt(delivery),
            allowedMentions: { users: [delivery.discordUserId] },
          };
          // The applicant's private channel, or a DM if it does not exist.
          if (delivery.channelId) {
            const channel = await guild().channels.fetch(delivery.channelId);
            if (!channel?.isTextBased()) return "undeliverable";
            await channel.send(message);
          } else {
            const user = await client.users.fetch(delivery.discordUserId);
            await user.send(message);
          }
        }),
      createTicketChannel: async (delivery) => {
        const member = await guild()
          .members.fetch(delivery.customerDiscordId)
          .catch((error: unknown) => {
            if (error instanceof DiscordAPIError && error.code === 10007)
              return null;
            throw error;
          });
        if (!member) return "absent";
        return deliver(async () => {
          // The same private channel a Discord-opened ticket gets; open()
          // records it with the API and notifies the right queue.
          await tickets.open({
            ticket: {
              id: delivery.ticketId,
              number: delivery.number,
              category: delivery.category,
              priority: delivery.priority,
            } as Parameters<typeof tickets.open>[0]["ticket"],
            queue: delivery.queue,
            creatorId: delivery.customerDiscordId,
            existingChannelId: null,
          });
        });
      },
      grantRole: (discordUserId, roleId, reason) =>
        deliver(async () => {
          // Only on an administrator's explicit activation (see the API).
          const member = await guild().members.fetch(discordUserId);
          await member.roles.add(roleId, reason.slice(0, 100));
          log.info("staff.role.granted", { discordUserId, roleId });
        }),
      sendDm: (discordUserId, content) =>
        deliver(async () => {
          const user = await client.users.fetch(discordUserId);
          await user.send({ content, allowedMentions: noMentions });
        }),
    },
    () => config.channelIds,
    log,
  );
  health.notifications(() => ({ ...notifications.stats }));
  const kickNotifications = () =>
    void notifications.tick().catch((error: unknown) =>
      log.warn("notifications.tick.failed", {
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  const membership = {
    api,
    log,
    rulesChannelId:
      config.channelIds["information:rules"] ??
      config.channelIds["01-start-here:rules"],
    kick,
  };
  const guarded = (label: string, work: () => Promise<unknown>) => () =>
    void work().catch((error: unknown) =>
      log.error(label, {
        error: error instanceof Error ? error.message : "unknown",
      }),
    );

  const onReady = () => {
    health.gatewayReady();
    const available = client.guilds.cache.has(config.guildId);
    health.guildAvailable(available);
    log.info("gateway.ready", {
      user: client.user?.tag,
      guildAvailable: available,
    });
    if (!available) log.error("guild.unavailable", { guildId: config.guildId });
    // Restart recovery: rebuild ticket channel mappings and re-apply access.
    else {
      void tickets.recover().catch((error: unknown) =>
        log.error("tickets.recover.failed", {
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      // Catch up on anything missed while offline, then reconcile everyone.
      guarded("roles.startup.failed", async () => {
        if (health.snapshot().automation.memberEvents)
          await backfillAcceptances(guild(), roleIds().member, membership);
        const queued = await api.reconcileRoles();
        log.info("roles.reconcile.queued", { queued });
        await roleSync.tick();
      })();
    }
  };
  if (client.isReady()) onReady();
  client.on(Events.ClientReady, onReady);
  client.on(Events.ShardResume, (_shard, replayed) => {
    health.gatewayReady();
    // A resume replays missed events, so nothing is lost; log it to see
    // how often Discord (or this machine's network) drops the connection.
    log.info("gateway.resumed", { replayedEvents: replayed });
  });
  client.on(Events.ShardReconnecting, () => {
    health.gatewayReconnecting();
    log.warn("gateway.reconnecting");
  });
  client.on(Events.ShardDisconnect, (event) => {
    health.gatewayDisconnected(event.code);
    log.warn("gateway.disconnected", { code: event.code });
  });
  client.on(Events.GuildDelete, (removed) => {
    if (removed.id === config.guildId) health.guildAvailable(false);
  });
  client.on(Events.Error, (error) => {
    health.recordError(error.message);
    log.error("client.error", { error: error.message });
  });
  client.on(
    Events.MessageCreate,
    (message) =>
      void handleMessage(message, dependencies).catch((error: unknown) =>
        log.error("message.failed", {
          messageId: message.id,
          error: error instanceof Error ? error.message : "unknown",
        }),
      ),
  );
  client.on(
    Events.InteractionCreate,
    (interaction) => void handleInteraction(interaction, dependencies),
  );
  client.on(Events.GuildMemberAdd, (member) =>
    member.guild.id === config.guildId
      ? guarded("member.join.failed", () => onMemberJoin(member, membership))()
      : undefined,
  );
  client.on(Events.GuildMemberUpdate, (before, after) =>
    after.guild.id === config.guildId
      ? guarded("member.update.failed", () =>
          onMemberUpdate(before, after, membership),
        )()
      : undefined,
  );
  client.on(Events.GuildMemberRemove, (member) =>
    member.guild.id === config.guildId
      ? guarded("member.leave.failed", () =>
          onMemberLeave(member, membership),
        )()
      : undefined,
  );

  const checkApi = async () => {
    try {
      health.apiChecked(await api.health(), null);
    } catch (error) {
      health.apiChecked(
        false,
        error instanceof Error ? error.name : "unreachable",
      );
    }
  };
  await checkApi();
  const timers = [
    setInterval(() => void checkApi(), 60_000),
    setInterval(() => {
      router.sweep();
      honeypot.sweep();
    }, 5 * 60_000),
    // The queue is the source of retries; this poll drains it.
    setInterval(kick, 15_000),
    setInterval(kickNotifications, 10_000),
  ];
  kickNotifications();
  const healthPort = Number(process.env.KUSH_BOT_HEALTH_PORT ?? 4321);
  const server = await startHealthServer(health, healthPort);
  log.info("health.listening", {
    url: `http://127.0.0.1:${healthPort}/health`,
  });

  const stop = async () => {
    for (const timer of timers) clearInterval(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await client.destroy();
    log.info("bot.stopped");
  };
  return { client, stop };
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href
) {
  startBot()
    .then(({ stop }) => {
      const shutdown = () => void stop().finally(() => process.exit(0));
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    })
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "KUSH bot failed to start",
      );
      process.exitCode = (error as { exitCode?: number } | null)?.exitCode ?? 1;
    });
}
