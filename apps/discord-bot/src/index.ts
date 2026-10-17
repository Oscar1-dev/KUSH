import { Client, Events, GatewayIntentBits } from "discord.js";
import { DiscordApiClient } from "./api-client.js";
import { loadRuntimeConfig, readBotToken } from "./config.js";
import { routeInteraction } from "./router.js";

export async function startBot(): Promise<Client> {
  const config = await loadRuntimeConfig();
  const componentSecret = process.env.KUSH_COMPONENT_SECRET?.trim();
  if (!componentSecret || componentSecret.length < 32)
    throw new Error(
      "KUSH_COMPONENT_SECRET must contain at least 32 characters",
    );
  const integrationSecret = process.env.KUSH_DISCORD_INTEGRATION_SECRET?.trim();
  if (!integrationSecret || integrationSecret.length < 32)
    throw new Error(
      "KUSH_DISCORD_INTEGRATION_SECRET must contain at least 32 characters",
    );
  const api = new DiscordApiClient({
    baseUrl: config.apiBaseUrl,
    tenantId: config.supportTenantId,
    guildId: config.guildId,
    integrationSecret,
  });
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, (ready) =>
    console.info(`KUSH bot connected as ${ready.user.tag}`),
  );
  client.on(
    Events.InteractionCreate,
    (interaction) =>
      void routeInteraction(interaction, {
        componentSecret,
        tickets: api,
        linking: api,
      }),
  );
  await client.login(await readBotToken());
  return client;
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href
) {
  void startBot().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "KUSH bot failed to start",
    );
    process.exitCode = 1;
  });
}
