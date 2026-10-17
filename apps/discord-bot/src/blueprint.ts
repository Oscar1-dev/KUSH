import { ChannelType, PermissionFlagsBits } from "discord.js";

export type RoleKey =
  | "owner"
  | "co-owner"
  | "management"
  | "administrator"
  | "developer"
  | "support-team"
  | "moderator"
  | "commission-manager"
  | "marketplace-reviewer"
  | "partner-manager"
  | "verified-seller"
  | "official-partner"
  | "reseller"
  | "verified-customer"
  | "premium-customer"
  | "beta-tester"
  | "contributor"
  | "member"
  | "product-updates"
  | "announcements"
  | "development-updates"
  | "marketplace-updates"
  | "community-events"
  | "kush-bot";

export interface DesiredRole {
  key: RoleKey;
  name: string;
  colour: number;
  permissions: bigint;
  hoist?: boolean;
}
export interface DesiredOverwrite {
  principal: RoleKey | "everyone";
  allow: bigint;
  deny: bigint;
}
export interface DesiredChannel {
  key: string;
  name: string;
  type: ChannelType;
  parentKey?: string;
  topic?: string;
  access: "information" | "community" | "staff" | "management" | "voice";
  overwrites: DesiredOverwrite[];
}

const role = (
  key: RoleKey,
  name: string,
  colour: number,
  permissions = 0n,
  hoist = false,
): DesiredRole => ({ key, name, colour, permissions, hoist });

export const requiredBotPermissions =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.ManageThreads |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles;

export const roles: DesiredRole[] = [
  role("owner", "Owner", 0x7c3aed, PermissionFlagsBits.Administrator, true),
  role("co-owner", "Co-Owner", 0x6d28d9, 0n, true),
  role("management", "Management", 0x5b21b6, 0n, true),
  role("administrator", "Administrator", 0x166534, 0n, true),
  role("developer", "Developer", 0x15803d),
  role("support-team", "Support Team", 0x16a34a),
  role("moderator", "Moderator", 0x22c55e),
  role("commission-manager", "Commission Manager", 0x047857),
  role("marketplace-reviewer", "Marketplace Reviewer", 0x0f766e),
  role("partner-manager", "Partner Manager", 0x0e7490),
  role("verified-seller", "Verified Seller", 0x7e22ce),
  role("official-partner", "Official Partner", 0x9333ea),
  role("reseller", "Reseller", 0xa855f7),
  role("verified-customer", "Verified Customer", 0x65a30d),
  role("premium-customer", "Premium Customer", 0xca8a04),
  role("beta-tester", "Beta Tester", 0x2563eb),
  role("contributor", "Contributor", 0x0891b2),
  role("member", "Member", 0x64748b),
  role("product-updates", "Product Updates", 0x4d7c0f),
  role("announcements", "Announcements", 0x3f6212),
  role("development-updates", "Development Updates", 0x0369a1),
  role("marketplace-updates", "Marketplace Updates", 0x6b21a8),
  role("community-events", "Community Events", 0xbe123c),
  role("kush-bot", "KUSH Bot", 0x22c55e, requiredBotPermissions),
];

const read =
  PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
const write =
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads;
const manage =
  PermissionFlagsBits.ManageMessages | PermissionFlagsBits.ManageChannels;
const staff: RoleKey[] = [
  "owner",
  "co-owner",
  "management",
  "administrator",
  "developer",
  "support-team",
  "moderator",
  "commission-manager",
  "marketplace-reviewer",
  "partner-manager",
];
const leaders: RoleKey[] = ["owner", "co-owner", "management"];

export function permissionPolicy(
  access: DesiredChannel["access"],
): DesiredOverwrite[] {
  if (access === "information")
    return [
      { principal: "everyone", allow: read, deny: write | manage },
      ...staff.map((principal) => ({
        principal,
        allow: read | write,
        deny: 0n,
      })),
    ];
  if (access === "community")
    return [
      { principal: "everyone", allow: read | write, deny: manage },
      ...staff.map((principal) => ({
        principal,
        allow: read | write | PermissionFlagsBits.ManageMessages,
        deny: 0n,
      })),
    ];
  if (access === "staff")
    return [
      {
        principal: "everyone",
        allow: 0n,
        deny: PermissionFlagsBits.ViewChannel,
      },
      ...staff.map((principal) => ({
        principal,
        allow: read | write,
        deny: 0n,
      })),
    ];
  if (access === "management")
    return [
      {
        principal: "everyone",
        allow: 0n,
        deny: PermissionFlagsBits.ViewChannel,
      },
      ...leaders.map((principal) => ({
        principal,
        allow: read | write,
        deny: 0n,
      })),
    ];
  return [
    {
      principal: "everyone",
      allow:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.Connect |
        PermissionFlagsBits.Speak,
      deny: manage,
    },
  ];
}

const category = (
  key: string,
  name: string,
  access: DesiredChannel["access"],
): DesiredChannel => ({
  key,
  name,
  type: ChannelType.GuildCategory,
  access,
  overwrites: permissionPolicy(access),
});
const text = (
  parentKey: string,
  key: string,
  name: string,
  access: DesiredChannel["access"],
  topic: string,
): DesiredChannel => ({
  key,
  name,
  type: ChannelType.GuildText,
  parentKey,
  access,
  topic,
  overwrites: permissionPolicy(access),
});
const voice = (
  parentKey: string,
  key: string,
  name: string,
): DesiredChannel => ({
  key,
  name,
  type: ChannelType.GuildVoice,
  parentKey,
  access: "voice",
  overwrites: permissionPolicy("voice"),
});

const section = (
  index: string,
  title: string,
  access: DesiredChannel["access"],
  names: string[],
  topics: Record<string, string> = {},
): DesiredChannel[] => {
  const parentKey = `${index}-${title.toLowerCase().replaceAll(" ", "-")}`;
  return [
    category(parentKey, `${index} — ${title}`, access),
    ...names.map((name) =>
      text(
        parentKey,
        `${parentKey}:${name}`,
        name,
        access,
        topics[name] ?? `KUSH ${name.replaceAll("-", " ")}.`,
      ),
    ),
  ];
};

export const channels: DesiredChannel[] = [
  ...section("01", "START HERE", "information", [
    "welcome",
    "rules",
    "announcements",
    "getting-started",
    "roles",
    "faq",
    "status",
  ]),
  ...section("02", "COMMUNITY", "community", [
    "general",
    "introductions",
    "showcase",
    "feedback",
    "suggestions",
    "polls",
    "off-topic",
    "media",
  ]),
  ...section("03", "KUSH PRODUCTS", "information", [
    "product-catalogue",
    "product-announcements",
    "updates-and-changelogs",
    "development-progress",
    "feature-requests",
    "bug-reports",
    "known-issues",
    "beta-programme",
  ]),
  ...section("04", "SERVICES & COMMISSIONS", "information", [
    "our-services",
    "commission-information",
    "pricing-and-quotes",
    "request-a-commission",
    "commission-showcase",
    "customer-reviews",
  ]),
  ...section("05", "MARKETPLACE & PARTNERS", "information", [
    "marketplace",
    "featured-products",
    "seller-information",
    "seller-applications",
    "partner-information",
    "partner-applications",
    "marketplace-support",
  ]),
  ...section("06", "SUPPORT", "information", [
    "support-centre",
    "open-a-ticket",
    "support-faq",
    "resolved-issues",
  ]),
  category("07-community-voice", "07 — COMMUNITY VOICE", "voice"),
  voice("07-community-voice", "voice:general", "General Lounge"),
  voice("07-community-voice", "voice:development", "Development Lounge"),
  voice("07-community-voice", "voice:hangout", "Community Hangout"),
  ...section("08", "STAFF OPERATIONS", "staff", [
    "staff-announcements",
    "staff-chat",
    "staff-tasks",
    "commission-management",
    "ticket-management",
    "marketplace-review",
    "partner-management",
    "moderation-log",
    "bot-log",
    "audit-log",
  ]),
  ...section("09", "MANAGEMENT", "management", [
    "management",
    "business-planning",
    "financial-planning",
    "infrastructure",
    "security-alerts",
  ]),
];

export const blueprint = { version: 1, roles, channels } as const;
