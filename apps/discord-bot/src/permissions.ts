import { ChannelType, PermissionFlagsBits } from "discord.js";

/**
 * Discord effective-permission evaluator.
 *
 * Mirrors the algorithm in Discord's "Permissions" topic
 * (https://docs.discord.com/developers/topics/permissions):
 *
 *  1. Guild owner → every permission.
 *  2. Base = @everyone role permissions | every held role's permissions.
 *  3. Administrator in base → every permission (overwrites are ignored).
 *  4. Channel overwrites, in order: @everyone overwrite, then the union of
 *     held roles' denies, then the union of held roles' allows, then the
 *     member-specific overwrite. A role allow beats another role's deny.
 *  5. Implicit rules: no ViewChannel → nothing; no SendMessages → no
 *     TTS/@everyone/attachments/embeds; no Connect → no voice actions;
 *     a timed-out member keeps only ViewChannel and ReadMessageHistory.
 *
 * It is pure and used for blueprint verification, drift exposure checks and
 * runtime authorisation hints. It is not proof of live effective permissions.
 */

export const ALL_PERMISSIONS = Object.values(PermissionFlagsBits).reduce(
  (all, flag) => all | flag,
  0n,
);

export type OverwriteKind = "role" | "member";

export interface EvaluatedOverwrite {
  id: string;
  kind: OverwriteKind;
  allow: bigint;
  deny: bigint;
}

export interface PermissionGuild {
  /** The guild ID, which is also the @everyone role ID. */
  id: string;
  ownerId: string;
  /** Role ID → guild-level permission bits. Should include @everyone. */
  rolePermissions: ReadonlyMap<string, bigint>;
}

export interface PermissionMember {
  id: string;
  roleIds: readonly string[];
  /** Epoch milliseconds; a future value means the member is timed out. */
  communicationDisabledUntil?: number | null;
}

export interface PermissionChannel {
  type: ChannelType;
  overwrites: readonly EvaluatedOverwrite[];
}

const textLikeChannels = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);
const voiceChannels = new Set<ChannelType>([
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

const sendDependent =
  PermissionFlagsBits.SendTTSMessages |
  PermissionFlagsBits.MentionEveryone |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.EmbedLinks;
const connectDependent =
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.Stream |
  PermissionFlagsBits.UseVAD |
  PermissionFlagsBits.PrioritySpeaker |
  PermissionFlagsBits.MuteMembers |
  PermissionFlagsBits.DeafenMembers |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.UseSoundboard |
  PermissionFlagsBits.UseExternalSounds |
  PermissionFlagsBits.UseEmbeddedActivities |
  PermissionFlagsBits.RequestToSpeak |
  PermissionFlagsBits.SetVoiceChannelStatus;
const timeoutRetained =
  PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;

export function isTimedOut(member: PermissionMember, now: number): boolean {
  return (
    typeof member.communicationDisabledUntil === "number" &&
    member.communicationDisabledUntil > now
  );
}

export function basePermissions(
  guild: PermissionGuild,
  member: PermissionMember,
): bigint {
  if (member.id === guild.ownerId) return ALL_PERMISSIONS;
  let permissions = guild.rolePermissions.get(guild.id) ?? 0n;
  for (const roleId of member.roleIds)
    permissions |= guild.rolePermissions.get(roleId) ?? 0n;
  if (permissions & PermissionFlagsBits.Administrator) return ALL_PERMISSIONS;
  return permissions;
}

export function channelPermissions(
  guild: PermissionGuild,
  member: PermissionMember,
  channel: PermissionChannel,
  now = Date.now(),
): bigint {
  const base = basePermissions(guild, member);
  if (base === ALL_PERMISSIONS) return ALL_PERMISSIONS;

  let permissions = base;
  const everyone = channel.overwrites.find(
    (overwrite) => overwrite.kind === "role" && overwrite.id === guild.id,
  );
  if (everyone) {
    permissions &= ~everyone.deny;
    permissions |= everyone.allow;
  }

  const held = new Set(member.roleIds);
  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of channel.overwrites) {
    if (
      overwrite.kind === "role" &&
      overwrite.id !== guild.id &&
      held.has(overwrite.id)
    ) {
      roleAllow |= overwrite.allow;
      roleDeny |= overwrite.deny;
    }
  }
  permissions &= ~roleDeny;
  permissions |= roleAllow;

  const own = channel.overwrites.find(
    (overwrite) => overwrite.kind === "member" && overwrite.id === member.id,
  );
  if (own) {
    permissions &= ~own.deny;
    permissions |= own.allow;
  }

  if (isTimedOut(member, now)) permissions &= timeoutRetained;
  if (!(permissions & PermissionFlagsBits.ViewChannel)) return 0n;
  if (
    textLikeChannels.has(channel.type) &&
    !(permissions & PermissionFlagsBits.SendMessages)
  )
    permissions &= ~sendDependent;
  if (
    voiceChannels.has(channel.type) &&
    !(permissions & PermissionFlagsBits.Connect)
  )
    permissions &= ~connectDependent;
  return permissions;
}

export const has = (permissions: bigint, flags: bigint) =>
  (permissions & flags) === flags;

export function permissionNames(permissions: bigint): string[] {
  return Object.entries(PermissionFlagsBits)
    .filter(([, flag]) => (permissions & flag) === flag)
    .map(([name]) => name);
}
