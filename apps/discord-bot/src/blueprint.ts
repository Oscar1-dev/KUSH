import { ChannelType, PermissionFlagsBits as P } from "discord.js";

/**
 * KUSH Discord server blueprint, version 3.
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
 * - Only Owner and Administrator carry Administrator. Separator and
 *   notification roles carry no permissions at all.
 * - Private channels deny @everyone ViewChannel and allow named roles.
 * - Downloads/setup channels contain instructions only; actual links are
 *   issued privately by the bot after a backend entitlement check.
 */

export type RoleKey =
  | "owner"
  | "administrator"
  | "developer"
  | "staff-manager"
  | "ticket-staff"
  | "moderator"
  | "kush-bot"
  | "creative-partner"
  | "verified-reseller"
  | "approved-seller"
  | "verified-customer"
  | "beta-tester"
  | "member"
  | "restricted"
  // Decorative dividers in the role list (no permissions, never hoisted).
  | "divider-staff"
  | "divider-partners"
  | "divider-community"
  | "divider-notifications"
  // Opt-in ping roles members toggle themselves in #roles.
  | "notify-announcements"
  | "notify-products"
  | "notify-development"
  | "notify-events";

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
/** Voice participation: Members get it in the lounge, Restricted lose it. */
export const voice = P.Connect | P.Speak | P.Stream | P.UseVAD;
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
  // Reads Discord's audit log to post the moderation log (owner must grant).
  P.ViewAuditLog |
  voice |
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

/**
 * Role colours: a cool lilac-to-mint run for staff, warm tones for partners,
 * the KUSH green for customers and quiet greys for everyone else. Dividers
 * and notification roles have no colour so they never tint a name.
 */
const colour = {
  owner: 0xcbbcff,
  administrator: 0xa78bfa,
  staffManager: 0x818cf8,
  developer: 0x7dd3fc,
  ticketStaff: 0x5eead4,
  moderator: 0x86efac,
  creative: 0xf9a8d4,
  seller: 0xfcd34d,
  reseller: 0xfdba74,
  customer: 0xa7fa43,
  beta: 0x93c5fd,
  member: 0xd4d4d8,
  restricted: 0x71717a,
  none: 0,
} as const;

/** A zero-permission divider; only ever organises the role list. */
const divider = (key: RoleKey, label: string) =>
  role(key, `─── ${label} ───`, colour.none, 0n);

/** Ordered highest to lowest. Array order is the required role hierarchy. */
export const roles: DesiredRole[] = [
  role("owner", "Owner", colour.owner, P.Administrator, {
    hoist: true,
    legacyKeys: ["owner"],
  }),
  // Discord Administrator approved by the owner on 18 Oct 2026: holders are
  // verified administrators who have signed the staff NDA. The role is only
  // ever granted by an explicit administrator activation (never by signing).
  role(
    "administrator",
    "Administrator",
    colour.administrator,
    P.Administrator,
    {
      hoist: true,
      legacyKeys: ["administrator"],
    },
  ),
  // The bot sits just under Administrator so it can keep every role below
  // in line with this blueprint. It still never assigns staff roles.
  role("kush-bot", "KUSH Bot", 0x22c55e, requiredBotPermissions, {
    managed: true,
  }),
  divider("divider-staff", "Staff"),
  // Was "Management" (same role ID, so the API's manager mapping holds);
  // takes over what Support Lead did.
  role("staff-manager", "Staff Manager", colour.staffManager, 0n, {
    hoist: true,
    legacyKeys: ["management"],
  }),
  role("developer", "Developer", colour.developer, 0n, {
    hoist: true,
    legacyKeys: ["developer"],
  }),
  role("ticket-staff", "Ticket Staff", colour.ticketStaff, 0n, {
    hoist: true,
    legacyKeys: ["support-staff", "support-team"],
  }),
  role("moderator", "Moderator", colour.moderator, P.ModerateMembers, {
    hoist: true,
    legacyKeys: ["moderator"],
  }),
  divider("divider-partners", "Partners"),
  role("creative-partner", "Creative Team", colour.creative, 0n, {
    hoist: true,
  }),
  role("approved-seller", "Verified Seller", colour.seller, 0n, {
    hoist: true,
    legacyKeys: ["verified-seller"],
  }),
  role("verified-reseller", "Reseller", colour.reseller, 0n, {
    hoist: true,
    legacyKeys: ["reseller"],
  }),
  divider("divider-community", "Community"),
  role("verified-customer", "Customer", colour.customer, 0n, {
    hoist: true,
    legacyKeys: ["verified-customer"],
  }),
  role("beta-tester", "Beta Tester", colour.beta, 0n, {
    legacyKeys: ["beta-tester"],
  }),
  role(
    "member",
    "Member",
    colour.member,
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
  role("restricted", "Restricted", colour.restricted, 0n),
  divider("divider-notifications", "Notifications"),
  role("notify-announcements", "Announcements", colour.none, 0n, {
    legacyKeys: ["announcements"],
  }),
  role("notify-products", "Product Updates", colour.none, 0n, {
    legacyKeys: ["product-updates"],
  }),
  role("notify-development", "Development Updates", colour.none, 0n, {
    legacyKeys: ["development-updates"],
  }),
  role("notify-events", "Community Events", colour.none, 0n, {
    legacyKeys: ["community-events"],
  }),
];

/** Opt-in ping roles a member may add or remove themselves (#roles). */
export const selfAssignableRoles: readonly RoleKey[] = [
  "notify-announcements",
  "notify-products",
  "notify-development",
  "notify-events",
];

/**
 * Roles staff may grant or revoke from the website or `/staff role`. Staff
 * roles are deliberately absent: they come only from recruitment activation
 * or the owner, in Discord.
 */
export const staffGrantableRoles: readonly RoleKey[] = [
  "verified-customer",
  "beta-tester",
  "creative-partner",
  "approved-seller",
  "verified-reseller",
];

/**
 * Roles to delete once the owner approves (see `cli.ts retire-roles`).
 * Each was reviewed on 20 Oct 2026: none holds members the blueprint needs,
 * and nothing in the API maps to them except where noted.
 */
export const retiredRoles: readonly (
  { configKey: string; reason: string } | { roleId: string; reason: string }
)[] = [
  {
    configKey: "co-owner",
    reason: "Dormant Administrator role with no holders",
  },
  { configKey: "support-lead", reason: "Merged into Staff Manager" },
  {
    configKey: "commission-manager",
    reason: "Covered by Staff Manager (API manager mapping)",
  },
  {
    configKey: "marketplace-reviewer",
    reason: "Marketplace not launched; no holders",
  },
  {
    configKey: "partner-manager",
    reason: "Covered by Staff Manager; no holders",
  },
  {
    configKey: "official-partner",
    reason: "Replaced by the partner programme roles; no holders",
  },
  {
    configKey: "premium-customer",
    reason: "Not a KUSH tier; Customer covers it",
  },
  { configKey: "contributor", reason: "Unused; no holders" },
  {
    configKey: "marketplace-updates",
    reason: "Marketplace not launched; no holders",
  },
  {
    roleId: "1561058075161657405",
    reason: "TEST product access: leftover from automated tests",
  },
  {
    roleId: "1561059232541835384",
    reason: "TEST product access: leftover from automated tests",
  },
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
  ...selfAssignableRoles,
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

/**
 * A community voice channel. Everyone can see it, only Members can join and
 * talk; Restricted members lose voice and chat participation.
 */
const voiceChannel = (
  parentKey: string,
  slug: string,
  name: string,
  legacyKeys?: string[],
): DesiredChannel => ({
  key: `${parentKey}:${slug}`,
  name,
  type: ChannelType.GuildVoice,
  parentKey,
  botAccess: "manage",
  overwrites: [
    { principal: "everyone", allow: 0n, deny: voice },
    { principal: "member", allow: voice, deny: 0n },
    ...communityModerators.map((principal) => ({
      principal,
      allow: read | voice | moderation,
      deny: 0n,
    })),
    { principal: "kush-bot", allow: read | voice, deny: 0n },
    { principal: "restricted", allow: 0n, deny: voice | participation },
  ],
  ...(legacyKeys ? { legacyKeys } : {}),
});

export const staffRoles: RoleKey[] = [
  "administrator",
  "developer",
  "staff-manager",
  "ticket-staff",
  "moderator",
];
const communityModerators: RoleKey[] = ["moderator", "administrator"];
const community: Access = { write: "members", moderate: communityModerators };
const customerResource: Access = {
  view: ["verified-customer", "staff-manager", "ticket-staff"],
  publish: ["developer", "staff-manager"],
};
const programme = (holder: RoleKey): Access => ({
  view: [holder, "administrator"],
  write: [holder, "administrator"],
});
/** The bot is excluded so a bot compromise cannot read these channels. */
const ownerOnly: Access = { view: [], bot: "observe" };

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
    { publish: ["administrator", "staff-manager"] },
    ["01-start-here:getting-started"],
  ),
  text(
    "information",
    "status",
    "Service and incident status, including support updates.",
    { publish: ["administrator", "developer", "staff-manager"] },
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
    { publish: ["developer", "staff-manager"] },
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

  category("support", "🛟 SUPPORT", { publish: ["staff-manager"] }, [
    "06-support",
  ]),
  text(
    "support",
    "create-ticket",
    "Open a private support ticket with the button below or !ticket.",
    { publish: ["staff-manager"], restrictedMayInteract: true },
    ["06-support:open-a-ticket"],
  ),
  text(
    "support",
    "faq",
    "Frequently asked questions and support information.",
    { publish: ["staff-manager"] },
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
      view: ["staff-manager", "ticket-staff"],
      write: ["staff-manager", "ticket-staff"],
      moderate: ["staff-manager"],
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
    { view: ["administrator", "developer", "staff-manager"] },
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
  category("tickets", "🎫 TICKETS", { view: ["staff-manager"] }),
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
    { publish: ["staff-manager", "administrator"] },
  ),
  text(
    "staff",
    "commission-management",
    "Commission coordination. Customer details stay in the dashboard.",
    { view: ["administrator", "staff-manager", "developer"] },
  ),
  text(
    "staff",
    "recruitment-review",
    "Recruitment coordination. Applicant details stay in application channels and the dashboard.",
    { view: ["administrator", "staff-manager"] },
  ),

  // ------------------------------------- restored legacy channels
  // Owner decision 18 Oct 2026: bring every archived channel back to its
  // original area with proper access (moved in place, history kept).
  // legacyKeys find them where they were archived.
  text(
    "information",
    "roles",
    "What each KUSH role means and how you get it.",
    { publish: ["administrator"] },
    ["archive:roles"],
  ),
  text(
    "information",
    "server-faq",
    "Quick answers about this server.",
    { publish: ["administrator"] },
    ["archive:faq-old"],
  ),
  text(
    "community",
    "feedback",
    "Feedback about KUSH, the server and the website.",
    community,
    ["archive:feedback"],
  ),
  text("community", "polls", "Community polls.", community, ["archive:polls"]),
  text(
    "community",
    "vouches",
    "Reviews from KUSH customers. Bought something? Leave yours with !vouch.",
    { moderate: communityModerators },
  ),
  voiceChannel("community", "general-lounge", "General Lounge", [
    "voice:general",
  ]),
  text(
    "products",
    "product-announcements",
    "Announcements about KUSH products.",
    { publish: ["administrator", "developer"] },
    ["archive:product-announcements"],
  ),
  text(
    "products",
    "development-progress",
    "Progress updates from the KUSH team.",
    { publish: ["administrator", "developer"] },
    ["archive:development-progress"],
  ),
  text(
    "products",
    "feature-requests",
    "Ideas for KUSH products. One idea per message.",
    community,
    ["archive:feature-requests"],
  ),
  text(
    "products",
    "bug-reports",
    "Public bug reports. Account or payment problems: open a private ticket instead.",
    community,
    ["archive:bug-reports"],
  ),
  text(
    "studio",
    "commission-information",
    "How KUSH commissions work, from enquiry to delivery.",
    { publish: ["administrator"] },
    ["archive:commission-information"],
  ),
  text(
    "studio",
    "pricing-and-quotes",
    "How pricing works. Every quote is personal and sent privately.",
    { publish: ["administrator"] },
    ["archive:pricing-and-quotes"],
  ),
  text(
    "studio",
    "customer-reviews",
    "Genuine reviews from real KUSH customers, shared with permission.",
    { publish: ["administrator"] },
    ["archive:customer-reviews"],
  ),
  text(
    "partnerships",
    "marketplace",
    "The KUSH marketplace (coming later).",
    { publish: ["administrator"] },
    ["archive:marketplace"],
  ),
  text(
    "partnerships",
    "featured-products",
    "Featured partner products.",
    { publish: ["administrator"] },
    ["archive:featured-products"],
  ),
  text(
    "partnerships",
    "seller-applications",
    "How to apply as a seller. Applications are private.",
    { publish: ["administrator"] },
    ["archive:seller-applications"],
  ),
  text(
    "partnerships",
    "marketplace-support",
    "General marketplace questions. Account issues: open a ticket.",
    community,
    ["archive:marketplace-support"],
  ),
  text(
    "support",
    "resolved-issues",
    "Known issues and their fixes.",
    { publish: ["staff-manager", "administrator"] },
    ["archive:resolved-issues"],
  ),
  text(
    "staff",
    "staff-announcements",
    "Announcements for the KUSH team.",
    { view: staffRoles, publish: ["administrator"] },
    ["archive:staff-announcements"],
  ),
  text(
    "staff",
    "staff-tasks",
    "Shared task list for the team.",
    { view: staffRoles, write: staffRoles },
    ["archive:staff-tasks"],
  ),
  text(
    "staff",
    "marketplace-review",
    "Reviewing marketplace submissions.",
    { view: ["administrator"] },
    ["archive:marketplace-review"],
  ),
  text(
    "staff",
    "audit-log",
    "Important staff and security events.",
    { view: ["administrator"] },
    ["archive:audit-log"],
  ),
];

/**
 * Category order, top to bottom, following a visitor's path: learn what
 * KUSH is, see the services, get help, then the community and partner
 * areas. Staff, ticket and owner areas sit last (members never see them).
 */
export const categoryOrder: readonly string[] = [
  "information",
  "studio",
  "support",
  "products",
  "community",
  "partnerships",
  "staff",
  "tickets",
  "reports",
  "owner",
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
        : ["staff-manager"];
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
  version: 3,
  everyonePermissions,
  roles,
  channels,
  categoryOrder,
} as const;

export type Blueprint = {
  version: number;
  everyonePermissions: bigint;
  roles: readonly DesiredRole[];
  channels: readonly DesiredChannel[];
  /** Category keys top to bottom; omitted means "leave the order alone". */
  categoryOrder?: readonly string[];
};
