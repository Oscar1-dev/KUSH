import { ChannelType, PermissionFlagsBits as P } from "discord.js";

/**
 * KUSH Discord server blueprint, version 2.
 *
 * Design rules (verified by test/blueprint.test.ts and documented in
 * docs/discord/PERMISSIONS.md):
 *
 * - Ordinary participation (send, react, attach) comes from the Member role's
 *   guild-level permissions, never from a channel allow overwrite. That is
 *   what lets a channel-level Restricted deny actually take effect: in
 *   Discord a role allow always beats another role's deny on the same channel.
 * - Elevated access (staff, customer, partner, beta) is granted by channel
 *   role allows. Restriction therefore strips those roles
 *   (see rolesAfterRestriction) instead of relying on overwrite precedence.
 * - Only the Owner role carries Administrator.
 * - Private channels deny @everyone ViewChannel and allow named roles.
 * - Downloads/setup channels contain instructions only; actual links are
 *   issued privately by the bot after a backend entitlement check.
 */

export type RoleKey =
  | "owner"
  | "administrator"
  | "developer"
  | "support-lead"
  | "support-staff"
  | "moderator"
  | "kush-bot"
  | "creative-partner"
  | "verified-reseller"
  | "approved-seller"
  | "verified-customer"
  | "beta-tester"
  | "member"
  | "restricted";

export type Principal = RoleKey | "everyone";

export interface DesiredRole {
  key: RoleKey;
  name: string;
  colour: number;
  permissions: bigint;
  hoist: boolean;
  /** Integration role created by Discord when the bot is installed. */
  managed?: boolean;
  /** v1 configuration keys whose stable IDs this role adopts. */
  legacyKeys?: string[];
}

export interface DesiredOverwrite {
  principal: Principal;
  allow: bigint;
  deny: bigint;
}

export type BotAccess = "manage" | "observe";

export interface DesiredChannel {
  key: string;
  name: string;
  type: ChannelType;
  parentKey?: string;
  topic?: string;
  /** "observe": the bot is deliberately excluded and cannot repair drift. */
  botAccess: BotAccess;
  overwrites: DesiredOverwrite[];
  legacyKeys?: string[];
}

// ---------------------------------------------------------------- bit sets

export const read = P.ViewChannel | P.ReadMessageHistory;
/** Everything a Restricted member must lose. */
export const participation =
  P.SendMessages |
  P.SendMessagesInThreads |
  P.CreatePublicThreads |
  P.CreatePrivateThreads |
  P.AddReactions |
  P.AttachFiles |
  P.EmbedLinks |
  P.UseExternalEmojis |
  P.UseExternalStickers |
  P.SendVoiceMessages |
  P.SendPolls |
  P.UseApplicationCommands |
  P.UseExternalApps;
const post =
  P.SendMessages | P.SendMessagesInThreads | P.EmbedLinks | P.AttachFiles;
const threadCreation = P.CreatePublicThreads | P.CreatePrivateThreads;
const moderation = P.ManageMessages | P.ManageThreads | P.PinMessages;

/**
 * Discord only lets the bot write overwrite bits and role permissions it
 * holds itself, so this is the union of every bit the blueprint applies
 * (enforced by test). None grant Administrator, ManageGuild, MentionEveryone,
 * webhooks, kicks or bans.
 */
export const requiredBotPermissions =
  read |
  post |
  participation |
  moderation |
  P.ManageChannels |
  P.ManageRoles |
  P.ModerateMembers |
  P.ChangeNickname;

// ------------------------------------------------------------------- roles

const role = (
  key: RoleKey,
  name: string,
  colour: number,
  permissions: bigint,
  options: Partial<Pick<DesiredRole, "hoist" | "managed" | "legacyKeys">> = {},
): DesiredRole => ({
  key,
  name,
  colour,
  permissions,
  hoist: options.hoist ?? false,
  ...(options.managed ? { managed: true } : {}),
  ...(options.legacyKeys ? { legacyKeys: options.legacyKeys } : {}),
});

/** Guild-level permissions for @everyone (unverified visitors). */
export const everyonePermissions = read | P.UseApplicationCommands;

/** Ordered highest to lowest. Array order is the required role hierarchy. */
export const roles: DesiredRole[] = [
  role("owner", "Owner", 0x7c3aed, P.Administrator, {
    hoist: true,
    legacyKeys: ["owner"],
  }),
  // Discord Administrator approved by the owner on 18 Oct 2026: holders are
  // verified administrators who have signed the staff NDA. The role is only
  // ever granted by an explicit administrator activation (never by signing).
  role("administrator", "Administrator", 0x166534, P.Administrator, {
    hoist: true,
    legacyKeys: ["administrator"],
  }),
  role("developer", "Developer", 0x15803d, 0n, {
    hoist: true,
    legacyKeys: ["developer"],
  }),
  role("support-lead", "Support Lead", 0x0e7490, 0n, { hoist: true }),
  role("support-staff", "Support Staff", 0x16a34a, 0n, {
    hoist: true,
    legacyKeys: ["support-team"],
  }),
  role("moderator", "Moderator", 0x22c55e, P.ModerateMembers, {
    hoist: true,
    legacyKeys: ["moderator"],
  }),
  role("kush-bot", "KUSH Bot", 0x22c55e, requiredBotPermissions, {
    managed: true,
  }),
  role("creative-partner", "Creative Partner", 0x9333ea, 0n),
  role("verified-reseller", "Verified Reseller", 0xa855f7, 0n, {
    legacyKeys: ["reseller"],
  }),
  role("approved-seller", "Approved Seller", 0x7e22ce, 0n, {
    legacyKeys: ["verified-seller"],
  }),
  role("verified-customer", "Verified Customer", 0x65a30d, 0n, {
    legacyKeys: ["verified-customer"],
  }),
  role("beta-tester", "Beta Tester", 0x2563eb, 0n, {
    legacyKeys: ["beta-tester"],
  }),
  role(
    "member",
    "Member",
    0x64748b,
    P.SendMessages |
      P.SendMessagesInThreads |
      P.CreatePublicThreads |
      P.AddReactions |
      P.EmbedLinks |
      P.AttachFiles |
      P.UseExternalEmojis |
      P.ChangeNickname,
    { legacyKeys: ["member"] },
  ),
  role("restricted", "Restricted", 0x6b7280, 0n),
];

export const roleByKey = (key: RoleKey) =>
  roles.find((item) => item.key === key)!;

/** Stable role ID for a key, falling back to its v1 legacy keys. */
export const configuredRoleId = (
  roleIds: Record<string, string>,
  key: RoleKey,
): string | undefined =>
  [key, ...(roleByKey(key).legacyKeys ?? [])]
    .map((candidate) => roleIds[candidate])
    .find((id): id is string => Boolean(id));

/** Roles a Restricted member may keep; every other role is stripped. */
export const restrictionRetainedRoles: readonly RoleKey[] = [
  "member",
  "restricted",
];

/** Roles the bot may assign or remove. Staff roles stay human-managed. */
export const botManagedRoles: readonly RoleKey[] = [
  "creative-partner",
  "verified-reseller",
  "approved-seller",
  "verified-customer",
  "beta-tester",
  "member",
  "restricted",
];

export function rolesAfterRestriction(held: readonly RoleKey[]): RoleKey[] {
  return [
    ...new Set<RoleKey>([
      ...held.filter((key) => restrictionRetainedRoles.includes(key)),
      "restricted",
    ]),
  ];
}

// ------------------------------------------------------------------ access

interface Access {
  /** Omit for public visibility; otherwise only these roles may view. */
  view?: RoleKey[];
  /** "members": Member base permissions apply (community chat). */
  write?: "members" | RoleKey[];
  /** Roles allowed to post in an otherwise read-only channel. */
  publish?: RoleKey[];
  moderate?: RoleKey[];
  bot?: "write" | "observe";
  /** Restricted may still use components/commands here (ticket appeals). */
  restrictedMayInteract?: boolean;
}

/**
 * The bot's own channel overwrite. An @everyone deny applies to the bot as
 * well, so this must re-grant every bit the blueprint ever denies there
 * (post, thread creation, polls). Otherwise the bot loses those permissions
 * in the channel and Discord then refuses to let it write that very deny
 * (error 50013), which is what blocked the first live apply.
 */
const botWrite = read | post | threadCreation | P.SendPolls | moderation;

export function compileAccess(access: Access): DesiredOverwrite[] {
  const isPrivate = access.view !== undefined;
  const communal = access.write === "members";
  const grants = new Map<Principal, { allow: bigint; deny: bigint }>();
  const grant = (principal: Principal, allow: bigint, deny = 0n) => {
    const current = grants.get(principal) ?? { allow: 0n, deny: 0n };
    grants.set(principal, {
      allow: current.allow | allow,
      deny: current.deny | deny,
    });
  };

  // Member base permissions include SendMessages, so any channel that is not
  // community chat must deny posting at @everyone level, private or not.
  const readOnly = post | threadCreation | P.SendPolls;
  if (isPrivate) grant("everyone", 0n, P.ViewChannel | readOnly);
  else if (!communal) grant("everyone", 0n, readOnly);

  for (const key of access.view ?? []) grant(key, read);
  if (Array.isArray(access.write))
    for (const key of access.write) grant(key, read | post);
  for (const key of access.publish ?? []) grant(key, read | post);
  for (const key of access.moderate ?? []) grant(key, read | moderation);
  if ((access.bot ?? "write") === "write") grant("kush-bot", botWrite);

  if (!isPrivate)
    grant(
      "restricted",
      0n,
      access.restrictedMayInteract
        ? participation & ~P.UseApplicationCommands
        : participation,
    );

  // A role's own deny must never cancel an allow granted to the same role.
  return [...grants].map(([principal, value]) => ({
    principal,
    allow: value.allow,
    deny: value.deny & ~value.allow,
  }));
}

// ---------------------------------------------------------------- channels

const category = (
  key: string,
  name: string,
  access: Access,
  legacyKeys?: string[],
): DesiredChannel => ({
  key,
  name,
  type: ChannelType.GuildCategory,
  botAccess: access.bot === "observe" ? "observe" : "manage",
  overwrites: compileAccess(access),
  ...(legacyKeys ? { legacyKeys } : {}),
});

const text = (
  parentKey: string,
  name: string,
  topic: string,
  access: Access,
  legacyKeys?: string[],
): DesiredChannel => ({
  key: `${parentKey}:${name}`,
  name,
  type: ChannelType.GuildText,
  parentKey,
  topic,
  botAccess: access.bot === "observe" ? "observe" : "manage",
  overwrites: compileAccess(access),
  ...(legacyKeys ? { legacyKeys } : {}),
});

const staffRoles: RoleKey[] = [
  "administrator",
  "developer",
  "support-lead",
  "support-staff",
  "moderator",
];
const communityModerators: RoleKey[] = ["moderator", "administrator"];
const community: Access = { write: "members", moderate: communityModerators };
const customerResource: Access = {
  view: ["verified-customer", "support-lead", "support-staff"],
  publish: ["developer", "support-lead"],
};
const programme = (holder: RoleKey): Access => ({
  view: [holder, "administrator"],
  write: [holder, "administrator"],
});
/** The bot is excluded so a bot compromise cannot read these channels. */
const ownerOnly: Access = { view: [], bot: "observe" };

/** Legacy channels archived on 18 Oct 2026 (see LEGACY-AUDIT.md). */
const archived: [string, "text" | "voice"][] = [
  ["roles", "text"],
  ["faq-old", "text"],
  ["feedback", "text"],
  ["polls", "text"],
  ["product-announcements", "text"],
  ["development-progress", "text"],
  ["feature-requests", "text"],
  ["bug-reports", "text"],
  ["commission-information", "text"],
  ["pricing-and-quotes", "text"],
  ["customer-reviews", "text"],
  ["marketplace", "text"],
  ["featured-products", "text"],
  ["marketplace-support", "text"],
  ["seller-applications", "text"],
  ["resolved-issues", "text"],
  ["staff-announcements", "text"],
  ["staff-tasks", "text"],
  ["marketplace-review", "text"],
  ["audit-log", "text"],
  ["development-lounge", "voice"],
  ["community-hangout", "voice"],
];

/** An archived voice channel: nobody but the owner (and the bot) can see it. */
const archivedVoice = (name: string): DesiredChannel => ({
  key: `archive:${name}`,
  name,
  type: ChannelType.GuildVoice,
  parentKey: "archive",
  botAccess: "manage",
  overwrites: compileAccess({ view: [] }),
});

export const channels: DesiredChannel[] = [
  category("information", "📌 INFORMATION", { publish: ["administrator"] }, [
    "01-start-here",
  ]),
  // Honeypot: deliberately writable by members. Compromised or spam accounts
  // that post everywhere land here first; the bot deletes the message and
  // times the author out (see src/moderation/honeypot.ts). Staff are exempt.
  text(
    "information",
    "do-not-post",
    "Do not post in this channel. Messages here are removed automatically and the author is timed out for review.",
    community,
  ),
  text(
    "information",
    "welcome",
    "Start here: what KUSH is and how this server works.",
    { publish: ["administrator"] },
    ["01-start-here:welcome"],
  ),
  text(
    "information",
    "rules",
    "Community rules. Breaking them can lead to restriction or removal.",
    { publish: ["administrator"] },
    ["01-start-here:rules"],
  ),
  text(
    "information",
    "announcements",
    "Official KUSH announcements.",
    { publish: ["administrator"] },
    ["01-start-here:announcements"],
  ),
  text(
    "information",
    "getting-started",
    "How to link your KUSH account, open tickets and use bot commands.",
    { publish: ["administrator", "support-lead"] },
    ["01-start-here:getting-started"],
  ),
  text(
    "information",
    "status",
    "Service and incident status, including support updates.",
    { publish: ["administrator", "developer", "support-lead"] },
    ["01-start-here:status"],
  ),

  category("community", "💬 COMMUNITY", community, ["02-community"]),
  text("community", "general", "General KUSH community chat.", community, [
    "02-community:general",
  ]),
  text("community", "introductions", "Introduce yourself.", community, [
    "02-community:introductions",
  ]),
  text(
    "community",
    "development",
    "Development and software discussion.",
    community,
  ),
  text("community", "showcases", "Share work you have built.", community, [
    "02-community:showcase",
  ]),
  text(
    "community",
    "suggestions",
    "Suggestions for KUSH products and the community.",
    community,
    ["02-community:suggestions"],
  ),

  category("studio", "🎨 KUSH STUDIO", { publish: ["administrator"] }, [
    "04-services-&-commissions",
  ]),
  text(
    "studio",
    "services",
    "Website development, custom software and creative services offered by KUSH.",
    { publish: ["administrator"] },
    ["04-services-&-commissions:our-services"],
  ),
  text(
    "studio",
    "commission-enquiries",
    "How to request a commission. Enquiries are handled privately by ticket.",
    { publish: ["administrator"] },
    ["04-services-&-commissions:request-a-commission"],
  ),

  category("products", "📦 PRODUCTS", { publish: ["developer"] }, [
    "03-kush-products",
  ]),
  text(
    "products",
    "products",
    "Verified KUSH product information.",
    { publish: ["administrator", "developer"] },
    ["03-kush-products:product-catalogue"],
  ),
  text(
    "products",
    "releases",
    "Release notes and changelogs.",
    { publish: ["developer"] },
    ["03-kush-products:updates-and-changelogs"],
  ),
  text(
    "products",
    "known-issues",
    "Confirmed issues and workarounds.",
    { publish: ["developer", "support-lead"] },
    ["03-kush-products:known-issues"],
  ),
  text(
    "products",
    "downloads",
    "How to obtain downloads. Links are sent privately by the bot after an entitlement check (!downloads).",
    customerResource,
  ),
  text(
    "products",
    "setup-guides",
    "Setup guides for verified customers (!guide <product>).",
    customerResource,
  ),
  text(
    "products",
    "beta-programme",
    "Beta tester discussion and feedback.",
    {
      view: ["beta-tester", "developer"],
      write: ["beta-tester", "developer"],
      moderate: ["developer"],
    },
    ["03-kush-products:beta-programme"],
  ),

  category("support", "🛟 SUPPORT", { publish: ["support-lead"] }, [
    "06-support",
  ]),
  text(
    "support",
    "create-ticket",
    "Open a private support ticket with the button below or !ticket.",
    { publish: ["support-lead"], restrictedMayInteract: true },
    ["06-support:open-a-ticket"],
  ),
  text(
    "support",
    "faq",
    "Frequently asked questions and support information.",
    { publish: ["support-lead"] },
    ["06-support:support-faq"],
  ),

  category("partnerships", "🤝 PARTNERSHIPS", { publish: ["administrator"] }, [
    "05-marketplace-&-partners",
  ]),
  text(
    "partnerships",
    "partner-information",
    "Reseller, seller and creative partner programmes. Apply privately with !apply.",
    { publish: ["administrator"] },
    ["05-marketplace-&-partners:partner-information"],
  ),
  text(
    "partnerships",
    "reseller-programme",
    "Resources for verified resellers.",
    programme("verified-reseller"),
  ),
  text(
    "partnerships",
    "seller-programme",
    "Resources for approved sellers.",
    programme("approved-seller"),
    ["05-marketplace-&-partners:seller-information"],
  ),
  text(
    "partnerships",
    "creative-partners",
    "Resources for creative partners.",
    programme("creative-partner"),
  ),

  category("staff", "🛠️ STAFF", { view: staffRoles }, ["08-staff-operations"]),
  text(
    "staff",
    "staff-chat",
    "Staff discussion. No customer personal data.",
    { view: staffRoles, write: staffRoles },
    ["08-staff-operations:staff-chat"],
  ),
  text(
    "staff",
    "ticket-queue",
    "Ticket summaries for claiming. Ticket content stays in the ticket.",
    {
      view: ["support-lead", "support-staff"],
      write: ["support-lead", "support-staff"],
      moderate: ["support-lead"],
    },
    ["08-staff-operations:ticket-management"],
  ),
  text(
    "staff",
    "moderation-log",
    "Moderation cases recorded by the bot.",
    { view: ["moderator", "administrator"] },
    ["08-staff-operations:moderation-log"],
  ),
  text(
    "staff",
    "bot-log",
    "Bot audit events.",
    { view: ["administrator", "developer"] },
    ["08-staff-operations:bot-log"],
  ),
  text(
    "staff",
    "operational-alerts",
    "Bot, API and integration health alerts.",
    { view: ["administrator", "developer", "support-lead"] },
  ),

  // The category stays bot-manageable so child channels can be created.
  category("owner", "👑 OWNER", { view: [] }, ["09-management"]),
  text(
    "owner",
    "owner-operations",
    "Owner operations and business administration.",
    ownerOnly,
    ["09-management:management"],
  ),
  text(
    "owner",
    "security-events",
    "Security events for owner review.",
    { view: ["administrator"] },
    ["09-management:security-alerts"],
  ),
  text(
    "owner",
    "infrastructure",
    "Infrastructure notes and alerts.",
    { view: ["administrator"] },
    ["09-management:infrastructure"],
  ),
  text(
    "owner",
    "confidential-partnerships",
    "Confidential partnership negotiations.",
    ownerOnly,
  ),

  // Containers for bot-created private channels. Members are added per
  // ticket by member overwrites; Support Staff only through assignment.
  category("tickets", "🎫 TICKETS", { view: ["support-lead"] }),
  category("reports", "🚨 REPORTS", { view: ["moderator", "administrator"] }),

  // ------------------------------------------- adopted legacy channels
  // Approved 18 Oct 2026 (docs/discord/LEGACY-AUDIT.md). Each is an existing
  // empty channel renamed and re-permissioned in place (history kept).
  text(
    "community",
    "off-topic",
    "Anything that doesn't fit elsewhere. Keep it friendly.",
    community,
  ),
  text(
    "community",
    "media",
    "Images and clips. Credit other people's work.",
    community,
  ),
  text(
    "studio",
    "portfolio",
    "Completed KUSH work, shared with the client's permission.",
    { publish: ["administrator", "developer"] },
  ),
  text(
    "partnerships",
    "applications",
    "How to apply to join KUSH. Applications are made privately on the website.",
    { publish: ["administrator"] },
  ),
  text(
    "support",
    "support-information",
    "Troubleshooting guides and how to get help.",
    { publish: ["support-lead", "administrator"] },
  ),
  text(
    "staff",
    "commission-management",
    "Commission coordination. Customer details stay in the dashboard.",
    { view: ["administrator", "developer"] },
  ),
  text(
    "staff",
    "recruitment-review",
    "Recruitment coordination. Applicant details stay in application channels and the dashboard.",
    { view: ["administrator"] },
  ),

  // ----------------------------------------------------------- archive
  // Redundant legacy channels, kept (not deleted) in an owner-only category
  // so they can be restored. The bot keeps access only to manage them.
  category("archive", "🗄 ARCHIVE", { view: [] }),
  ...archived.map(([name, type]) =>
    type === "voice"
      ? archivedVoice(name)
      : text("archive", name, "Archived.", { view: [] }),
  ),
];

export const channelByKey = (key: string) =>
  channels.find((item) => item.key === key);

// ---------------------------------------------------------- dynamic tickets

/** "application": staff applications (applicant + recruiters only). */
export type TicketKind = "support" | "report" | "application";

export interface DynamicOverwrite {
  principal: Principal | { memberId: string };
  allow: bigint;
  deny: bigint;
}

const participant = read | post;

/**
 * Overwrites for a private ticket channel. Moderation reports are visible
 * to moderators/administrators only, never to support staff.
 */
export function ticketChannelOverwrites(input: {
  kind: TicketKind;
  creatorId: string;
  assigneeIds: readonly string[];
}): DynamicOverwrite[] {
  const staffRole: RoleKey[] =
    input.kind === "report"
      ? ["moderator", "administrator"]
      : input.kind === "application"
        ? // Applicants' personal details: administrators only, never support
          // (managers review on the website; owner sees all channels).
          ["administrator"]
        : ["support-lead"];
  return [
    { principal: "everyone", allow: 0n, deny: P.ViewChannel },
    { principal: "kush-bot", allow: botWrite, deny: 0n },
    ...staffRole.map((principal) => ({
      principal,
      allow: participant,
      deny: 0n,
    })),
    { principal: { memberId: input.creatorId }, allow: participant, deny: 0n },
    ...input.assigneeIds
      .filter((id) => id !== input.creatorId)
      .map((memberId) => ({
        principal: { memberId },
        allow: participant,
        deny: 0n,
      })),
  ];
}

/** Bump `version` whenever the managed set changes. */
export const blueprint = {
  version: 2,
  everyonePermissions,
  roles,
  channels,
} as const;

export type Blueprint = {
  version: number;
  everyonePermissions: bigint;
  roles: readonly DesiredRole[];
  channels: readonly DesiredChannel[];
};
