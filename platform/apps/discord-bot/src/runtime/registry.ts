import { blueprint, roles as blueprintRoles } from "../blueprint.js";
import {
  embed,
  partnerPanel,
  rulesPanel,
  unavailablePanel,
} from "../panels.js";
import { planProvisioning } from "../provisioning.js";
import { ticketCategories } from "../tickets/categories.js";
import { ticketCommands } from "../tickets/commands.js";
import { moderationCommands } from "../moderation/commands.js";
import { communityCommands } from "../community/commands.js";
import { hasAuthority } from "./authority.js";
import {
  CommandError,
  usageError,
  type CommandContext,
  type CommandDefinition,
  type CommandGroup,
} from "./command.js";
import { applyButtons, linkButton, ticketButton } from "./components.js";
import { formatLiveAccess, liveAccess } from "./live-permissions.js";

const signer = (context: CommandContext) => ({
  secret: context.services.componentSecret,
  now: context.services.now(),
});

/** Sends account-specific output privately and tells the channel where it went. */
async function privately(
  context: CommandContext,
  message: Parameters<CommandContext["replyPrivately"]>[0],
) {
  const delivery = await context.replyPrivately(message);
  if (context.source === "prefix")
    await context.reply({
      content:
        delivery === "dm"
          ? "I've sent you the details by direct message."
          : "I couldn't send you a direct message. Enable DMs from server members, or use the slash command version instead (its replies are private).",
    });
}

/** Honest placeholder for commands whose backend arrives in a later slice. */
const pending = (
  path: string[],
  group: CommandGroup,
  authority: CommandDefinition["authority"],
  summary: string,
  usage: string,
  reason: string,
  extra: Partial<CommandDefinition> = {},
): CommandDefinition => ({
  path,
  group,
  authority,
  summary,
  usage,
  unavailable: reason,
  ...extra,
  run: async (context) => {
    await context.reply(unavailablePanel(`!${path.join(" ")}`, reason));
  },
});

const ENTITLEMENTS =
  "Product entitlements are not connected yet. Nothing is shown until KUSH has verified purchase records.";

export const commands: CommandDefinition[] = [
  // ------------------------------------------------------------ community
  {
    path: ["help"],
    aliases: [["commands"]],
    group: "Community",
    authority: "everyone",
    allowRestricted: true,
    summary: "List the commands you can use",
    usage: "!help [command]",
    options: [{ name: "command", description: "Command to explain" }],
    run: async (context) => {
      const available = context.registry.filter(
        (command) =>
          hasAuthority(context.actor, command.authority) &&
          (!context.actor.roles.has("restricted") || command.allowRestricted),
      );
      if (context.args.length) {
        const wanted = context.args.join(" ").replace(/^!/, "").toLowerCase();
        const match = available.find(
          (command) => command.path.join(" ") === wanted,
        );
        if (!match)
          throw new CommandError(
            `No command \`!${wanted}\` is available to you.`,
          );
        await context.reply({
          embeds: [
            embed(
              `!${match.path.join(" ")}`,
              `${match.summary}\nUsage: \`${match.usage}\`${match.unavailable ? `\n\n_Not available yet:_ ${match.unavailable}` : ""}`,
            ),
          ],
        });
        return;
      }
      const groups = new Map<string, string[]>();
      for (const command of available)
        groups.set(command.group, [
          ...(groups.get(command.group) ?? []),
          `\`!${command.path.join(" ")}\` ${command.summary}${command.unavailable ? " _(coming soon)_" : ""}`,
        ]);
      await context.reply({
        embeds: [
          embed(
            "KUSH commands",
            [...groups]
              .map(([group, lines]) => `**${group}**\n${lines.join("\n")}`)
              .join("\n\n")
              .slice(0, 4000),
          ),
        ],
      });
    },
  },
  {
    path: ["rules"],
    group: "Community",
    authority: "everyone",
    allowRestricted: true,
    summary: "Show the community rules",
    usage: "!rules",
    run: async (context) => context.reply(rulesPanel()),
  },
  {
    path: ["faq"],
    group: "Community",
    authority: "everyone",
    allowRestricted: true,
    summary: "Common questions",
    usage: "!faq",
    run: async (context) =>
      context.reply({
        embeds: [
          embed(
            "Frequently asked questions",
            [
              "**How do I get help?** Type `!ticket` or use the button in #create-ticket. Tickets are private to you and authorised staff.",
              "**How do I link my KUSH account?** Generate a link code in your KUSH account, then type `!account`.",
              "**Where are my downloads?** Downloads are only issued privately to verified customers with `!downloads`. Never trust download links posted by other members.",
              "**How do I request a commission?** Open a ticket and choose *Commission enquiry*. Quotes are provided privately and nothing is agreed until both sides confirm in writing.",
              "**Can I become a seller or reseller?** See #partner-information and `!partner`.",
            ].join("\n\n"),
          ),
        ],
      }),
  },
  {
    path: ["status"],
    group: "Community",
    authority: "everyone",
    summary: "KUSH service status",
    usage: "!status",
    cooldownMs: 15_000,
    run: async (context) => {
      const health = context.services.health.snapshot();
      const describe = (state: string) =>
        ({ ok: "operational", degraded: "degraded", down: "unavailable" })[
          state
        ] ?? "unknown";
      await context.reply({
        embeds: [
          embed(
            "KUSH status",
            [
              `Discord bot: ${describe(health.gateway.state)}`,
              `KUSH services: ${describe(health.api.state)}`,
              "See #status for announced incidents.",
            ].join("\n"),
          ),
        ],
      });
    },
  },
  {
    path: ["ticket"],
    aliases: [["support"], ["new", "ticket"]],
    group: "Community",
    authority: "everyone",
    allowRestricted: true,
    cooldownMs: 10_000,
    summary: "Open a private support ticket",
    usage: "!ticket",
    run: async (context) =>
      context.reply({
        content: `<@${context.actor.userId}>, choose a category on the next step. Categories: ${ticketCategories.map((category) => category.label).join(", ")}.`,
        components: [ticketButton(signer(context), context.actor.userId)],
      }),
  },
  pending(
    ["products"],
    "Community",
    "everyone",
    "Published KUSH products",
    "!products",
    "The product catalogue is not connected yet. No products are listed until KUSH publishes verified product records.",
  ),

  // ------------------------------------------------------------ customers
  {
    path: ["account"],
    aliases: [["link"]],
    group: "Customers",
    authority: "everyone",
    cooldownMs: 10_000,
    summary: "Link your Discord account to your KUSH account",
    usage: "!account",
    run: async (context) =>
      context.reply({
        content: `<@${context.actor.userId}>, generate a link code in your KUSH account, then press the button. The code is entered privately.`,
        components: [linkButton(signer(context), context.actor.userId)],
      }),
  },
  {
    path: ["licenses"],
    aliases: [["licences"]],
    group: "Customers",
    authority: "everyone",
    cooldownMs: 10_000,
    summary: "Your KUSH products and licence status (sent privately)",
    usage: "!licenses",
    run: async (context) => {
      const result = await context.services.api.memberEntitlements(
        context.actor.userId,
      );
      const status: Record<string, string> = {
        active: "active",
        expired: "expired",
        refunded: "refunded",
        revoked: "revoked",
      };
      const lines = !result.linked
        ? [
            "Your Discord account is not linked to a KUSH account yet.",
            "Generate a link code in your KUSH account, then type `!account`.",
          ]
        : result.entitlements.length
          ? result.entitlements.map(
              (item) =>
                `**${item.productName}** — ${status[item.status] ?? item.status}${
                  item.expiresAt && item.status === "active"
                    ? ` (until <t:${Math.floor(new Date(item.expiresAt).getTime() / 1000)}:D>)`
                    : ""
                }`,
            )
          : ["Your linked KUSH account has no products yet."];
      await privately(context, {
        embeds: [embed("Your KUSH licences", lines.join("\n"))],
      });
    },
  },
  pending(
    ["guide"],
    "Customers",
    "member",
    "Setup guide for a product you own",
    "!guide <product>",
    ENTITLEMENTS,
    {
      options: [
        { name: "product", description: "Product name", required: true },
      ],
    },
  ),
  pending(
    ["setup", "guide"],
    "Customers",
    "member",
    "Setup guide for a product you own",
    "!setup guide <product>",
    ENTITLEMENTS,
    {
      options: [
        { name: "product", description: "Product name", required: true },
      ],
    },
  ),

  // ------------------------------------------------------------- partners
  {
    path: ["partner"],
    aliases: [["partners"]],
    group: "Partners",
    authority: "everyone",
    summary: "Partner programme information",
    usage: "!partner",
    run: async (context) => context.reply({ embeds: partnerPanel().embeds }),
  },
  ...(["seller", "reseller"] as const).map((programme): CommandDefinition => ({
    path: ["apply", programme],
    group: "Partners",
    authority: "member",
    cooldownMs: 30_000,
    summary: `Apply to the ${programme} programme`,
    usage: `!apply ${programme}`,
    run: async (context) =>
      context.reply({
        content: `<@${context.actor.userId}>, your application is entered privately and needs a linked KUSH account (\`!account\`).`,
        components: [
          applyButtons(signer(context), context.actor.userId, [programme]),
        ],
      }),
  })),

  // -------------------------------------------------------- support staff
  ...ticketCommands,

  // ----------------------------------------------------------- moderation
  ...moderationCommands,
  ...communityCommands,

  // ------------------------------------------------------- administration
  {
    path: ["health"],
    group: "Administration",
    authority: "administrator",
    summary: "Bot, gateway and API health",
    usage: "!health",
    run: async (context) => {
      const health = context.services.health.snapshot();
      await privately(context, {
        embeds: [
          embed(
            `Health: ${health.status}`,
            [
              `Gateway: ${health.gateway.state} (ready ${health.gateway.readyAt ?? "never"}, reconnects ${health.gateway.reconnects})`,
              `Guild: ${health.guild.state}`,
              `KUSH API: ${health.api.state}${health.api.detail ? ` — ${health.api.detail}` : ""} (checked ${health.api.checkedAt ?? "never"})`,
              `Prefix commands: ${health.prefixCommands.enabled ? "enabled" : `disabled — ${health.prefixCommands.reason}`}`,
              `Commands: ${health.commands.succeeded} ok, ${health.commands.failed} failed`,
              `Uptime: ${health.uptimeSeconds}s`,
              health.lastError ? `Last error: ${health.lastError}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ],
      });
    },
  },
  {
    path: ["config"],
    group: "Administration",
    authority: "administrator",
    summary: "Non-secret bot configuration",
    usage: "!config",
    run: async (context) => {
      const { config } = context.services;
      const mappedRoles = blueprintRoles.filter(
        (role) => config.roleIds[role.key],
      ).length;
      const mappedChannels = blueprint.channels.filter(
        (channel) => config.channelIds[channel.key],
      ).length;
      await privately(context, {
        embeds: [
          embed(
            "Bot configuration",
            [
              `Blueprint: v${blueprint.version}`,
              `Guild: ${config.guildId}`,
              `Application: ${config.applicationId}`,
              `KUSH API: ${config.apiBaseUrl}`,
              `Support tenant: ${config.supportTenantId}`,
              `Mapped roles: ${mappedRoles}/${blueprintRoles.length}`,
              `Mapped channels: ${mappedChannels}/${blueprint.channels.length}`,
              "Secrets are never displayed.",
            ].join("\n"),
          ),
        ],
      });
    },
  },
  {
    path: ["permissions"],
    aliases: [["perms"]],
    group: "Administration",
    authority: "administrator",
    cooldownMs: 10_000,
    summary: "Effective channel access for a member or role",
    usage: "!permissions <@member | role name>",
    options: [
      {
        name: "target",
        description: "Member mention or role name",
        required: true,
      },
    ],
    run: async (context) => {
      const target = context.args.join(" ").trim();
      if (!target)
        throw usageError(
          context.registry.find(
            (command) => command.path[0] === "permissions",
          )!,
        );
      const observed = await context.services.observeGuild();
      const memberId = /^<@!?(\d{17,20})>$/.exec(target)?.[1];
      let subject: { memberId: string; roleIds: string[] };
      let title: string;
      if (memberId) {
        const roleIds = await context.services.memberRoleIds(memberId);
        if (!roleIds)
          throw new CommandError("That member is not in this server.");
        subject = { memberId, roleIds };
        title = `Access for <@${memberId}>`;
      } else {
        const roleId = /^<@&(\d{17,20})>$/.exec(target)?.[1];
        const role = observed.roles.find(
          (item) =>
            item.id === roleId ||
            item.name.toLowerCase() === target.toLowerCase(),
        );
        if (!role) throw new CommandError(`No role named "${target}".`);
        subject = { memberId: "kush-hypothetical-member", roleIds: [role.id] };
        title = `Access for a member with only "${role.name}"`;
      }
      const [first, ...rest] = formatLiveAccess(
        liveAccess(observed, subject, context.services.now()),
      );
      await privately(context, {
        embeds: [embed(title, first ?? "No channels.")],
      });
      for (const chunk of rest)
        await context.replyPrivately({ content: chunk });
    },
  },
  {
    path: ["sync"],
    group: "Administration",
    authority: "administrator",
    cooldownMs: 30_000,
    summary: "Dry-run the server blueprint against the live server",
    usage: "!sync",
    run: async (context) => {
      const observed = await context.services.observeGuild();
      const plan = planProvisioning(
        blueprint,
        observed,
        context.services.config,
      );
      const exposed = plan.operations.filter(
        (operation) =>
          operation.action === "update-channel" && operation.exposure,
      ).length;
      const counts = new Map<string, number>();
      for (const operation of plan.operations)
        counts.set(operation.action, (counts.get(operation.action) ?? 0) + 1);
      await privately(context, {
        embeds: [
          embed(
            plan.operations.length || plan.conflicts.length
              ? "Server differs from blueprint"
              : "Server matches blueprint",
            [
              `Blueprint v${plan.blueprintVersion}`,
              ...[...counts].map(([action, count]) => `${action}: ${count}`),
              exposed
                ? `⚠ ${exposed} private channel(s) currently visible to members`
                : "",
              `Unmanaged channels visible to members: ${plan.unmanaged.channels.filter((item) => item.visibleToMembers).length}`,
              `Owner actions: ${plan.conflicts.length}`,
              ...plan.conflicts
                .slice(0, 8)
                .map((conflict) => `• ${conflict.reason}`),
              "",
              "This is a dry run. Applying requires the owner-approved CLI apply.",
            ]
              .filter((line) => line !== "")
              .join("\n")
              .slice(0, 4000),
          ),
        ],
      });
    },
  },
  pending(
    ["entitlement", "grant"],
    "Administration",
    "administrator",
    "Grant a product entitlement",
    "!entitlement grant @member <product>",
    ENTITLEMENTS,
  ),
  pending(
    ["entitlement", "revoke"],
    "Administration",
    "administrator",
    "Revoke a product entitlement",
    "!entitlement revoke @member <product>",
    ENTITLEMENTS,
  ),
];
