import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const snowflake = z
  .string()
  .regex(/^\d{17,20}$/, "must be a Discord snowflake");

export const runtimeConfigSchema = z.object({
  applicationId: snowflake,
  guildId: snowflake,
  apiBaseUrl: z
    .string()
    .url()
    .refine(
      (url) =>
        new URL(url).hostname === "127.0.0.1" ||
        new URL(url).hostname === "localhost",
      "M4 local runtime must use a loopback API",
    ),
  supportTenantId: z.string().uuid(),
  roleIds: z.record(z.string(), snowflake).default({}),
  channelIds: z.record(z.string(), snowflake).default({}),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

/** Repository-root `.local/discord.json` (gitignored), from src/ or dist/. */
export const defaultConfigPath = fileURLToPath(
  new URL("../../../.local/discord.json", import.meta.url),
);

export const configPath = (environment: NodeJS.ProcessEnv = process.env) =>
  environment.KUSH_DISCORD_CONFIG ?? defaultConfigPath;

export async function loadRuntimeConfig(
  path = configPath(),
): Promise<RuntimeConfig> {
  return runtimeConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/**
 * Reads the token from DISCORD_BOT_TOKEN, or from the file named by
 * DISCORD_BOT_TOKEN_FILE (kept under the gitignored .local/secrets/).
 */
export async function readBotToken(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const file = environment.DISCORD_BOT_TOKEN_FILE?.trim();
  const token = (
    environment.DISCORD_BOT_TOKEN ?? (file ? await readFile(file, "utf8") : "")
  ).trim();
  if (!token)
    throw new Error(
      "DISCORD_BOT_TOKEN or DISCORD_BOT_TOKEN_FILE is required at runtime; tokens must not be stored in configuration",
    );
  return token;
}
