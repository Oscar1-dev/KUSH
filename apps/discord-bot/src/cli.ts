import { readFile } from "node:fs/promises";
import { blueprint } from "./blueprint.js";
import { commandJson } from "./commands.js";
import { runtimeConfigSchema } from "./config.js";
import {
  planProvisioning,
  serialisePlan,
  type ObservedGuild,
} from "./provisioning.js";

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === "commands") {
    console.log(JSON.stringify(commandJson, null, 2));
    return;
  }
  if (operation === "validate") {
    const path =
      args.find((argument) => !argument.startsWith("--")) ??
      process.env.KUSH_DISCORD_CONFIG ??
      ".local/discord.json";
    runtimeConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
    console.log(`Valid Discord configuration: ${path}`);
    return;
  }
  if (operation === "setup") {
    if (!args.includes("--dry-run"))
      throw new Error(
        "Live apply is intentionally unavailable; run setup with --dry-run",
      );
    const statePath = args.find((argument) => argument.endsWith(".json"));
    const observed: ObservedGuild = statePath
      ? (JSON.parse(await readFile(statePath, "utf8")) as ObservedGuild)
      : { roles: [], channels: [] };
    console.log(
      JSON.stringify(
        serialisePlan(planProvisioning(blueprint, observed)),
        null,
        2,
      ),
    );
    return;
  }
  throw new Error(
    "Usage: cli.ts commands | validate [config.json] | setup --dry-run [observed.json]",
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Discord command failed",
  );
  process.exitCode = 1;
});
