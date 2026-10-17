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
  const prefix = [
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ];
  if (wantPrefix) {
    const client = new Client({ intents: [...base, ...prefix] });
    try {
      await client.login(token);
      health.prefixCommands(true);
      return client;
    } catch (error) {
      await client.destroy();
      if (!isDisallowedIntents(error)) throw error;
      log.warn("gateway.intent.disallowed", {
        intent: "MessageContent",
        action:
          "Enable Message Content Intent in the Discord Developer Portal → Bot.",
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
  const services: BotServices = {
    config,
    componentSecret,
    health,
    log,
    api,
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
      const member = await guild()
        .members.fetch(userId)
        .catch(() => null);
      return member ? [...member.roles.cache.keys()] : null;
    },
  };
  const router = new CommandRouter(commands);
  const dependencies = { router, services };

  const onReady = () => {
    health.gatewayReady();
    const available = client.guilds.cache.has(config.guildId);
    health.guildAvailable(available);
    log.info("gateway.ready", {
      user: client.user?.tag,
      guildAvailable: available,
    });
    if (!available) log.error("guild.unavailable", { guildId: config.guildId });
  };
  if (client.isReady()) onReady();
  client.on(Events.ClientReady, onReady);
  client.on(Events.ShardResume, () => health.gatewayReady());
  client.on(Events.ShardReconnecting, () => {
    health.gatewayReconnecting();
    log.warn("gateway.reconnecting");
  });
  client.on(Events.ShardDisconnect, (event) => {
    health.gatewayDisconnected();
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
    setInterval(() => router.sweep(), 5 * 60_000),
  ];
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
