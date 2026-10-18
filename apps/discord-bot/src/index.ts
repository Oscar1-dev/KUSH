import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type EmbedBuilder,
  type Guild,
} from "discord.js";
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
import { card, loadBrand, notificationMessage } from "./panels.js";
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
import { registerModLog } from "./moderation/mod-log.js";
import { UptimeWatcher } from "./runtime/uptime.js";
import { RuleWatchTracker } from "./moderation/rule-watch.js";
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
  // GuildModeration (not privileged): audit-log entries for the mod log.
  const base = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildModeration];
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
          card({
            emoji: event.outcome === "ok" ? "🤖" : "⚠️",
            title: event.action,
            tone: event.outcome === "ok" ? "staff" : "warning",
            fields: [
              { name: "Actor", value: `<@${event.actorId}>`, inline: true },
              { name: "Outcome", value: event.outcome, inline: true },
              ...Object.entries(event.detail ?? {}).map(([key, value]) => ({
                name: key,
                value: String(value).slice(0, 1_000),
                inline: true,
              })),
            ],
            footer: "KUSH • Bot log",
            timestamp: true,
          }),
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
  services.moderation = {
    permitted: (kind) => {
      const needed = {
        kick: PermissionFlagsBits.KickMembers,
        ban: PermissionFlagsBits.BanMembers,
        unban: PermissionFlagsBits.BanMembers,
        timeout: PermissionFlagsBits.ModerateMembers,
        untimeout: PermissionFlagsBits.ModerateMembers,
      }[kind as string];
      return (
        needed === undefined ||
        Boolean(guild().members.me?.permissions.has(needed))
      );
    },
    member: async (userId) => {
      const member = await Promise.race([
        guild()
          .members.fetch(userId)
          .catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
      return member
        ? {
            roleIds: [...member.roles.cache.keys()],
            isOwner: member.id === guild().ownerId,
            isBot: member.user.bot,
          }
        : null;
    },
    timeout: async (userId, ms, reason) => {
      await (await guild().members.fetch(userId)).timeout(ms, reason);
    },
    kick: async (userId, reason) => {
      await guild().members.kick(userId, reason);
    },
    ban: async (userId, reason) => {
      // Also clears the last hour of their messages (spam clean-up).
      await guild().bans.create(userId, {
        reason,
        deleteMessageSeconds: 3_600,
      });
    },
    unban: async (userId, reason) => {
      await guild().bans.remove(userId, reason);
    },
    notify: async (userId, message) => {
      try {
        const user = await client.users.fetch(userId);
        await user.send({ embeds: [message] });
        return true;
      } catch {
        return false;
      }
    },
    removeRoles: async (userId, roleIds, reason) => {
      const member = await guild().members.fetch(userId);
      await member.roles.remove(roleIds, reason);
    },
    post: async (channelId, message) => {
      const channel = guild().channels.cache.get(channelId);
      if (!channel?.isSendable()) return null;
      const sent = await channel.send({
        embeds: [message],
        allowedMentions: { parse: [] },
      });
      return sent.id;
    },
    deleteMessage: async (channelId, messageId) => {
      const channel = guild().channels.cache.get(channelId);
      if (channel?.isTextBased())
        await channel.messages.delete(messageId).catch(() => undefined);
    },
    log: async (message) => {
      const id = config.channelIds["staff:moderation-log"];
      const channel = id ? guild().channels.cache.get(id) : undefined;
      if (channel?.isSendable())
        await channel.send({
          embeds: [message],
          allowedMentions: { parse: [] },
        });
    },
  };
  const router = new CommandRouter(commands);
  const honeypot = new HoneypotTracker();
  const ruleWatch = new RuleWatchTracker();
  const dependencies = { router, services, honeypot, ruleWatch };

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
          await channel.send({
            ...notificationMessage(content),
            allowedMentions: noMentions,
          });
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
          await user.send({
            ...notificationMessage(content),
            allowedMentions: noMentions,
          });
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
    welcomeChannelId: config.channelIds["information:welcome"],
    supportChannelId: config.channelIds["support:create-ticket"],
    kick,
  };
  registerModLog(client, config, log, api);
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
  // KUSH logo + banner (from the bot's profile) on every card.
  await loadBrand(client).catch((error: unknown) =>
    log.warn("brand.load.failed", {
      error: error instanceof Error ? error.message : "unknown",
    }),
  );
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

  // ------------------------------------------------------ uptime alerts
  const alert = async (message: EmbedBuilder) => {
    const id = config.channelIds["staff:operational-alerts"];
    const channel = id ? guild().channels.cache.get(id) : undefined;
    if (channel?.isSendable())
      await channel.send({ embeds: [message], allowedMentions: { parse: [] } });
  };
  const siteUrl =
    process.env.KUSH_PUBLIC_SITE_URL ??
    process.env.KUSH_SITE_URL ??
    "http://localhost:3000";
  const uptime = new UptimeWatcher(
    [
      {
        name: "KUSH API",
        probe: () => api.health(),
      },
      {
        name: "KUSH website",
        // Any non-5xx answer means the site is serving pages.
        probe: async () =>
          (await fetch(siteUrl, { signal: AbortSignal.timeout(10_000) }))
            .status < 500,
      },
      {
        // While Discord itself is unreachable the "down" card can't be
        // posted, but the recovery card (with the downtime) always is.
        name: "Discord connection",
        probe: async () => health.snapshot().gateway.state === "ok",
      },
    ],
    alert,
  );
  // Every (re)start is announced, so supervisor restarts are visible.
  void alert(
    card({
      emoji: "🤖",
      title: "KUSH bot online",
      tone: "staff",
      description: `Watching the API, the website and the Discord connection. Alerts post here.`,
      footer: "KUSH • Uptime",
      timestamp: true,
    }),
  ).catch(() => undefined);
  const timers = [
    setInterval(() => void uptime.tick(), 60_000),
    setInterval(() => void checkApi(), 60_000),
    setInterval(() => {
      router.sweep();
      honeypot.sweep();
      ruleWatch.sweep();
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
