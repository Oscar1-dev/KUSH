import { readFile } from "node:fs/promises";
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

export async function loadRuntimeConfig(
  path = process.env.KUSH_DISCORD_CONFIG ?? ".local/discord.json",
): Promise<RuntimeConfig> {
  return runtimeConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export function readBotToken(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const token = environment.DISCORD_BOT_TOKEN?.trim();
  if (!token)
    throw new Error(
      "DISCORD_BOT_TOKEN is required at runtime and must not be stored in configuration",
    );
  return token;
}
