import { fileURLToPath } from "node:url";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { blueprint } from "./blueprint.js";
import { commandJson } from "./commands.js";
import { configPath, readBotToken, runtimeConfigSchema } from "./config.js";
import { renderMatrixMarkdown } from "./permission-matrix.js";
import {
  applyPlan,
  ApplyError,
  applyLockdown,
  planHash,
  planLockdown,
  planProvisioning,
  reviveObservedGuild,
  serialisePlan,
  type ObservedGuild,
  type ProvisionPlan,
  type StableIds,
} from "./provisioning.js";

const usage = `Usage:
  cli.ts commands                       Print slash command JSON
  cli.ts validate [config.json]         Validate non-secret runtime configuration
  cli.ts matrix                         Print the generated permission matrix
  cli.ts inspect                        LIVE READ-ONLY: snapshot the configured guild and print a plan
  cli.ts setup --dry-run [snapshot.json] [--restrict-unmanaged]
                                        Offline plan from a snapshot and the configured stable IDs
  cli.ts setup --apply --confirm-guild <id> --plan-hash <hash> [--restrict-unmanaged]
                                        LIVE MUTATION: apply a reviewed plan (owner approval required)
  cli.ts content --preview | content [--publish --confirm-guild <id>]
                                        Official channel messages (preview, plan, or LIVE publish/edit)
  cli.ts register-commands             LIVE: register slash fallbacks in the configured guild only
  cli.ts lockdown [--apply --confirm-guild <id>]
                                        Restrict exposed sensitive channels (owner-authorised)
  cli.ts retire-roles [--apply --confirm-guild <id> --plan-hash <hash>]
                                        Review (then delete) obsolete roles listed in the blueprint`;

const flag = (args: string[], name: string) => args.includes(name);
const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

async function readConfig(path = configPath()) {
  return runtimeConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

const snapshotPath = () => join(dirname(configPath()), "discord-observed.json");

function summarise(plan: ProvisionPlan) {
  const exposures = plan.operations.filter(
    (op) => op.action === "update-channel" && op.exposure,
  );
  const exposedUnmanaged = plan.unmanaged.channels.filter(
    (item) => item.visibleToMembers,
  );
  return {
    blueprintVersion: plan.blueprintVersion,
    guildId: plan.guildId,
    planHash: planHash(plan),
    counts: Object.fromEntries(
      [...new Set(plan.operations.map((op) => op.action))].map((action) => [
        action,
        plan.operations.filter((op) => op.action === action).length,
      ]),
    ),
    exposedManagedChannels: exposures.map((op) =>
      op.action === "update-channel" ? op.key : "",
    ),
    exposedUnmanagedChannels: exposedUnmanaged.map((item) => item.name),
    conflicts: plan.conflicts,
    unmanagedRoles: plan.unmanaged.roles.map((role) => role.name),
    operations: plan.operations.map((op) =>
      op.action === "update-channel" || op.action === "update-role"
        ? { action: op.action, key: op.key, changes: op.changes }
        : op.action === "create-role" || op.action === "create-channel"
          ? { action: op.action, key: op.key }
          : op,
    ),
  };
}

async function liveSession<T>(
  work: (
    adapter: import("./discord-adapter.js").DiscordGuildAdapter,
    config: Awaited<ReturnType<typeof readConfig>>,
  ) => Promise<T>,
  options: { members?: boolean } = {},
): Promise<T> {
  const config = await readConfig();
  const { connectGuild } = await import("./discord-adapter.js");
  const { adapter, close } = await connectGuild(
    await readBotToken(),
    config.guildId,
    options,
  );
  try {
    return await work(adapter, config);
  } finally {
    await close();
  }
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === "commands") {
    console.log(JSON.stringify(commandJson, null, 2));
    return;
  }
  if (operation === "matrix") {
    process.stdout.write(renderMatrixMarkdown(blueprint));
    return;
  }
  if (operation === "validate") {
    const path =
      args.find((argument) => !argument.startsWith("--")) ?? configPath();
    await readConfig(path);
    console.log(`Valid Discord configuration: ${path}`);
    return;
  }
  if (operation === "inspect") {
    await liveSession(async (adapter, config) => {
      const observed = await adapter.observe();
      await writeFile(
        snapshotPath(),
        `${JSON.stringify(serialisePlan(observed), null, 2)}\n`,
      );
      const plan = planProvisioning(blueprint, observed, config, {
        restrictUnmanaged: flag(args, "--restrict-unmanaged"),
      });
      console.log(JSON.stringify(serialisePlan(summarise(plan)), null, 2));
      console.error(`Read-only snapshot written to ${snapshotPath()}`);
    });
    return;
  }
  if (operation === "branding") {
    // Sets the bot's avatar (KUSH logo) and profile banner from assets/.
    // Discord rate-limits avatar changes, so this is run rarely and on purpose.
    const { Client, GatewayIntentBits } = await import("discord.js");
    const assets = new URL("../assets/", import.meta.url);
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(await readBotToken());
    try {
      if (!flag(args, "--apply")) {
        console.log(
          "Dry run: would set the bot avatar to assets/kush-logo.jpg and banner to assets/kush-banner.jpg. Re-run with --apply.",
        );
        return;
      }
      // fileURLToPath decodes spaces ("ALL PROJECTS") correctly.
      await client.user!.setAvatar(
        fileURLToPath(new URL("kush-logo.jpg", assets)),
      );
      await client.user!.setBanner(
        fileURLToPath(new URL("kush-banner.jpg", assets)),
      );
      const user = await client.user!.fetch(true);
      console.log(
        JSON.stringify(
          {
            avatar: user.displayAvatarURL({ size: 256 }),
            banner: user.bannerURL({ size: 1024 }),
          },
          null,
          2,
        ),
      );
    } finally {
      await client.destroy();
    }
    return;
  }
  if (operation === "content") {
    const { channelContent } = await import("./content/channel-content.js");
    const { renderContentPreview, publishContent, planContent } =
      await import("./content/publisher.js");
    const config = await readConfig();
    if (flag(args, "--preview")) {
      process.stdout.write(
        renderContentPreview(channelContent, config.channelIds),
      );
      return;
    }
    await liveSession(async (_adapter, liveConfig) => {
      const { Client, GatewayIntentBits } = await import("discord.js");
      const { DiscordContentAdapter } =
        await import("./content/content-discord.js");
      const client = new Client({ intents: [GatewayIntentBits.Guilds] });
      await client.login(await readBotToken());
      try {
        const guild = await client.guilds.fetch(liveConfig.guildId);
        // Cards carry the KUSH logo and banner from the bot's profile.
        const { loadBrand } = await import("./panels.js");
        await loadBrand(client);
        const adapter = new DiscordContentAdapter(guild);
        if (!flag(args, "--publish")) {
          console.log(
            JSON.stringify(
              await planContent(
                channelContent,
                liveConfig.channelIds,
                liveConfig.panelMessages,
                adapter,
              ),
              null,
              2,
            ),
          );
          return;
        }
        if (option(args, "--confirm-guild") !== liveConfig.guildId)
          throw new Error(
            "--confirm-guild does not match the configured guild",
          );
        const result = await publishContent(
          channelContent,
          liveConfig.channelIds,
          liveConfig.panelMessages,
          adapter,
        );
        await writeFile(
          configPath(),
          `${JSON.stringify({ ...liveConfig, panelMessages: result.published }, null, 2)}\n`,
        );
        console.log(
          JSON.stringify(
            { actions: result.actions, errors: result.errors },
            null,
            2,
          ),
        );
      } finally {
        await client.destroy();
      }
    });
    return;
  }
  if (operation === "register-commands") {
    const config = await readConfig();
    const { REST, Routes } = await import("discord.js");
    const rest = new REST().setToken(await readBotToken());
    // Guild-scoped: affects only the configured KUSH guild, updates instantly.
    const result = (await rest.put(
      Routes.applicationGuildCommands(config.applicationId, config.guildId),
      { body: commandJson },
    )) as { name: string }[];
    console.log(
      `Registered ${result.length} guild commands: ${result.map((item) => item.name).join(", ")}`,
    );
    return;
  }
  if (operation === "retire-roles") {
    const { planRoleRetirement, retirementHash } =
      await import("./retire-roles.js");
    const { retiredRoles } = await import("./blueprint.js");
    await liveSession(
      async (adapter, config) => {
        const observed = await adapter.observe();
        const items = planRoleRetirement(
          retiredRoles,
          observed,
          config.roleIds,
          await adapter.roleHolders(),
        );
        const hash = retirementHash(items);
        if (!flag(args, "--apply")) {
          console.log(
            JSON.stringify({ dryRun: true, planHash: hash, items }, null, 2),
          );
          return;
        }
        if (option(args, "--confirm-guild") !== config.guildId)
          throw new Error(
            "--confirm-guild does not match the configured guild",
          );
        if (option(args, "--plan-hash") !== hash)
          throw new Error(
            "The roles changed since the reviewed dry-run (plan hash differs). Review again.",
          );
        const backups = join(dirname(configPath()), "backups");
        await mkdir(backups, { recursive: true });
        await copyFile(
          configPath(),
          join(
            backups,
            `discord-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
          ),
        );
        const deleted: string[] = [];
        for (const item of items.filter((entry) => entry.action === "delete")) {
          await adapter.deleteRole(
            item.roleId,
            `KUSH blueprint v3: ${item.reason}`.slice(0, 100),
          );
          deleted.push(item.roleId);
        }
        // Forget deleted roles so nothing maps to a missing ID.
        const roleIds = Object.fromEntries(
          Object.entries(config.roleIds).filter(
            ([, id]) => !deleted.includes(id),
          ),
        );
        const raw = JSON.parse(await readFile(configPath(), "utf8")) as Record<
          string,
          unknown
        >;
        await writeFile(
          configPath(),
          `${JSON.stringify({ ...raw, roleIds }, null, 2)}\n`,
        );
        console.log(
          JSON.stringify(
            {
              deleted,
              ownerActions: items.filter((item) => item.action === "owner"),
            },
            null,
            2,
          ),
        );
      },
      { members: true },
    );
    return;
  }
  if (operation === "lockdown") {
    await liveSession(async (adapter, config) => {
      const observed = await adapter.observe();
      const targets = planLockdown(blueprint, observed, config);
      if (!flag(args, "--apply")) {
        console.log(JSON.stringify({ dryRun: true, targets }, null, 2));
        return;
      }
      if (option(args, "--confirm-guild") !== config.guildId)
        throw new Error("--confirm-guild does not match the configured guild");
      const locked = await applyLockdown(targets, observed, adapter);
      const after = await adapter.observe();
      const stillExposed = planLockdown(blueprint, after, config);
      console.log(JSON.stringify({ locked, stillExposed }, null, 2));
    });
    return;
  }
  if (operation === "setup" && flag(args, "--dry-run")) {
    const config = await readConfig().catch(() => undefined);
    const path =
      args.find((argument) => argument.endsWith(".json")) ?? snapshotPath();
    const observed: ObservedGuild = reviveObservedGuild(
      JSON.parse(await readFile(path, "utf8")),
    );
    const ids: StableIds = config ?? {};
    const plan = planProvisioning(blueprint, observed, ids, {
      restrictUnmanaged: flag(args, "--restrict-unmanaged"),
    });
    console.log(JSON.stringify(serialisePlan(summarise(plan)), null, 2));
    return;
  }
  if (operation === "setup" && flag(args, "--apply")) {
    const confirmGuild = option(args, "--confirm-guild");
    const reviewedHash = option(args, "--plan-hash");
    if (!confirmGuild || !reviewedHash)
      throw new Error(
        "Live apply requires --confirm-guild <id> and --plan-hash <hash> from a reviewed dry-run",
      );
    await liveSession(async (adapter, config) => {
      if (config.guildId !== confirmGuild)
        throw new Error("--confirm-guild does not match the configured guild");
      const plan = planProvisioning(
        blueprint,
        await adapter.observe(),
        config,
        {
          restrictUnmanaged: flag(args, "--restrict-unmanaged"),
        },
      );
      if (planHash(plan) !== reviewedHash)
        throw new Error(
          `Live plan ${planHash(plan)} differs from reviewed ${reviewedHash}; run inspect again and re-review`,
        );
      const backups = join(dirname(configPath()), "backups");
      await mkdir(backups, { recursive: true });
      await copyFile(
        configPath(),
        join(
          backups,
          `discord-${new Date().toISOString().replaceAll(":", "-")}.json`,
        ),
      );
      const persist = async (mapping: StableIds) =>
        writeFile(
          configPath(),
          `${JSON.stringify(
            {
              ...config,
              roleIds: { ...config.roleIds, ...mapping.roleIds },
              channelIds: { ...config.channelIds, ...mapping.channelIds },
            },
            null,
            2,
          )}\n`,
        );
      try {
        const result = await applyPlan(plan, adapter);
        await persist(result.mapping);
        const after = planProvisioning(blueprint, await adapter.observe(), {
          ...config,
          ...result.mapping,
        });
        console.log(
          JSON.stringify(
            serialisePlan({ applied: result.applied, after: summarise(after) }),
            null,
            2,
          ),
        );
      } catch (error) {
        if (error instanceof ApplyError) await persist(error.partial.mapping);
        throw error;
      }
    });
    return;
  }
  throw new Error(usage);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Discord command failed",
  );
  process.exitCode = 1;
});
