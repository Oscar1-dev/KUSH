import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import {
  rolesAfterRestriction,
  type Blueprint,
  type DesiredChannel,
  type DynamicOverwrite,
  type RoleKey,
} from "./blueprint.js";
import {
  channelPermissions,
  has,
  type EvaluatedOverwrite,
  type PermissionGuild,
} from "./permissions.js";

/** A simulated guild where every role ID equals its blueprint key. */
export const SIMULATED_GUILD_ID = "@everyone";
export const SIMULATED_OWNER_ID = "guild-owner";

export function simulatedGuild(blueprint: Blueprint): PermissionGuild {
  return {
    id: SIMULATED_GUILD_ID,
    ownerId: SIMULATED_OWNER_ID,
    rolePermissions: new Map<string, bigint>([
      [SIMULATED_GUILD_ID, blueprint.everyonePermissions],
      ...blueprint.roles.map((role) => [role.key, role.permissions] as const),
    ]),
  };
}

const principalId = (principal: DynamicOverwrite["principal"]) =>
  typeof principal === "object"
    ? principal.memberId
    : principal === "everyone"
      ? SIMULATED_GUILD_ID
      : principal;

export const simulatedOverwrites = (
  overwrites: readonly DynamicOverwrite[],
): EvaluatedOverwrite[] =>
  overwrites.map((overwrite) => ({
    id: principalId(overwrite.principal),
    kind: typeof overwrite.principal === "object" ? "member" : "role",
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));

export interface Persona {
  key: string;
  label: string;
  memberId: string;
  roles: RoleKey[];
  timedOut?: boolean;
}

export const personas: Persona[] = [
  {
    key: "visitor",
    label: "@everyone (unverified)",
    memberId: "visitor",
    roles: [],
  },
  { key: "member", label: "Member", memberId: "member", roles: ["member"] },
  {
    key: "restricted",
    label: "Restricted (after restriction)",
    memberId: "restricted",
    roles: rolesAfterRestriction([
      "member",
      "verified-customer",
      "beta-tester",
    ]),
  },
  {
    key: "timed-out",
    label: "Member (timed out)",
    memberId: "timed-out",
    roles: ["member"],
    timedOut: true,
  },
  {
    key: "customer",
    label: "Verified Customer",
    memberId: "customer",
    roles: ["member", "verified-customer"],
  },
  {
    key: "beta",
    label: "Beta Tester",
    memberId: "beta",
    roles: ["member", "beta-tester"],
  },
  {
    key: "seller",
    label: "Approved Seller",
    memberId: "seller",
    roles: ["member", "approved-seller"],
  },
  {
    key: "reseller",
    label: "Verified Reseller",
    memberId: "reseller",
    roles: ["member", "verified-reseller"],
  },
  {
    key: "creative",
    label: "Creative Partner",
    memberId: "creative",
    roles: ["member", "creative-partner"],
  },
  {
    key: "moderator",
    label: "Moderator",
    memberId: "moderator",
    roles: ["member", "moderator"],
  },
  {
    key: "ticket-staff",
    label: "Support Staff",
    memberId: "ticket-staff",
    roles: ["member", "ticket-staff"],
  },
  {
    key: "staff-manager",
    label: "Support Lead",
    memberId: "staff-manager",
    roles: ["member", "staff-manager"],
  },
  {
    key: "developer",
    label: "Developer",
    memberId: "developer",
    roles: ["member", "developer"],
  },
  {
    key: "administrator",
    label: "Administrator",
    memberId: "administrator",
    roles: ["member", "administrator"],
  },
  {
    key: "owner-role",
    label: "Owner role",
    memberId: "owner-role",
    roles: ["member", "owner"],
  },
  { key: "bot", label: "KUSH Bot", memberId: "bot", roles: ["kush-bot"] },
];

export type AccessLevel = "none" | "read" | "write" | "manage";

const NOW = 1_000_000;

export function personaPermissions(
  blueprint: Blueprint,
  persona: Persona,
  channel: { type: ChannelType; overwrites: EvaluatedOverwrite[] },
): bigint {
  return channelPermissions(
    simulatedGuild(blueprint),
    {
      id: persona.memberId,
      roleIds: persona.roles,
      communicationDisabledUntil: persona.timedOut ? NOW + 60_000 : null,
    },
    channel,
    NOW,
  );
}

export function accessLevel(permissions: bigint): AccessLevel {
  if (!has(permissions, P.ViewChannel)) return "none";
  if (has(permissions, P.ManageMessages)) return "manage";
  if (has(permissions, P.SendMessages)) return "write";
  return "read";
}

export const channelForEvaluation = (channel: DesiredChannel) => ({
  type: channel.type,
  overwrites: simulatedOverwrites(channel.overwrites),
});

export function buildMatrix(blueprint: Blueprint) {
  return blueprint.channels
    .filter((channel) => channel.type !== ChannelType.GuildCategory)
    .map((channel) => ({
      channel,
      access: Object.fromEntries(
        personas.map((persona) => [
          persona.key,
          accessLevel(
            personaPermissions(
              blueprint,
              persona,
              channelForEvaluation(channel),
            ),
          ),
        ]),
      ) as Record<string, AccessLevel>,
    }));
}

const symbol: Record<AccessLevel, string> = {
  none: "·",
  read: "R",
  write: "W",
  manage: "M",
};

/** Markdown matrix. Regenerate with `pnpm --filter @kush/discord-bot discord:matrix`. */
export function renderMatrixMarkdown(blueprint: Blueprint): string {
  const rows = buildMatrix(blueprint);
  const header = ["Channel", ...personas.map((persona) => persona.label)];
  const lines = [
    `<!-- Generated from apps/discord-bot/src/blueprint.ts (v${blueprint.version}). Do not edit by hand. -->`,
    "",
    "# KUSH Discord permission matrix",
    "",
    "Computed by the effective-permission evaluator (`src/permissions.ts`) from blueprint v" +
      blueprint.version +
      ". `M` manage messages, `W` send, `R` view and read only, `·` no access. The guild owner account and the Owner role (Administrator) bypass every overwrite.",
    "",
    "This is a model of the blueprint, not evidence of live guild state. Live verification is recorded separately (see DEPLOYMENT.md).",
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map((_, index) => (index === 0 ? "---" : ":-:")).join(" | ")} |`,
    ...rows.map(
      (row) =>
        `| ${[`${row.channel.parentKey}/#${row.channel.name}`, ...personas.map((persona) => symbol[row.access[persona.key]!])].join(" | ")} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
