import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

const guild = (name: string, description: string) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild);
const subcommands = (
  name: string,
  description: string,
  entries: readonly (readonly [string, string])[],
  permission?: bigint,
) => {
  const command = guild(name, description);
  if (permission !== undefined) command.setDefaultMemberPermissions(permission);
  for (const [subcommand, detail] of entries)
    command.addSubcommand((option) =>
      option.setName(subcommand).setDescription(detail),
    );
  return command;
};

const info = [
  ["help", "Show KUSH bot help"],
  ["about", "About KUSH"],
  ["services", "View KUSH services"],
  ["products", "View verified product information"],
  ["status", "View available service status"],
  ["faq", "View common questions"],
] as const;
const ticket = [
  ["open", "Open a private support request"],
  ["list", "List support requests you can access"],
  ["close", "Close a support request"],
  ["reopen", "Reopen a support request"],
  ["claim", "Claim an assigned support request"],
  ["assign", "Assign authorised support staff"],
  ["priority", "Set support priority"],
  ["transcript", "Export an authorised transcript"],
] as const;
const commission = [
  ["request", "Submit a commission request"],
  ["status", "View commission status"],
  ["quote", "Record an authorised quote"],
  ["assign", "Assign commission staff"],
  ["close", "Close a commission request"],
] as const;
const marketplace = [
  ["browse", "Browse approved marketplace items"],
  ["submit", "Submit an item for staff review"],
  ["status", "View your submission status"],
  ["approve", "Approve an item for publication"],
  ["reject", "Reject a marketplace submission"],
] as const;
const partner = [
  ["apply", "Submit a partner application"],
  ["status", "View your application status"],
  ["review", "Review a partner application"],
] as const;
const config = [
  ["view", "View non-secret bot configuration"],
  ["validate", "Validate the current guild configuration"],
] as const;

export const commandBuilders = [
  ...info.map(([name, description]) => guild(name, description)),
  subcommands("ticket", "Manage KUSH support requests", ticket),
  subcommands("commission", "Manage KUSH commissions", commission),
  subcommands(
    "marketplace",
    "Browse and manage reviewed marketplace submissions",
    marketplace,
  ),
  subcommands("partner", "Manage KUSH partner applications", partner),
  guild("suggest", "Submit a community suggestion"),
  guild("report", "Privately report a concern"),
  guild("roles", "Choose opt-in notification roles"),
  guild("profile", "View your KUSH community profile"),
  guild("warn", "Warn a member").setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers,
  ),
  guild("timeout", "Temporarily restrict a member").setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers,
  ),
  guild("untimeout", "Remove a member timeout").setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers,
  ),
  guild("kick", "Remove a member from this server").setDefaultMemberPermissions(
    PermissionFlagsBits.KickMembers,
  ),
  guild("ban", "Ban a member from this server").setDefaultMemberPermissions(
    PermissionFlagsBits.BanMembers,
  ),
  guild(
    "purge",
    "Delete a confirmed range of messages",
  ).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  guild(
    "modhistory",
    "View authorised moderation history",
  ).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  subcommands(
    "config",
    "Inspect KUSH bot configuration",
    config,
    PermissionFlagsBits.ManageGuild,
  ),
  guild("health", "Check bot and backend health").setDefaultMemberPermissions(
    PermissionFlagsBits.ManageGuild,
  ),
  guild(
    "sync",
    "Reconcile authorised KUSH resources",
  ).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  guild(
    "audit",
    "View authorised KUSH audit events",
  ).setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),
];

export const commandJson = commandBuilders.map((command) => command.toJSON());
