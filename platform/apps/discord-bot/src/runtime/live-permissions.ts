import { ChannelType } from "discord.js";
import { accessLevel, type AccessLevel } from "../permission-matrix.js";
import { channelPermissions, type PermissionGuild } from "../permissions.js";
import type { ObservedGuild } from "../provisioning.js";

export interface LiveAccessRow {
  channelId: string;
  name: string;
  category: string | null;
  access: AccessLevel;
}

/**
 * Effective access of a member (or hypothetical role set) to every text
 * channel in the observed guild, using the live roles and overwrites.
 */
export function liveAccess(
  observed: ObservedGuild,
  subject: { memberId: string; roleIds: readonly string[] },
  now = Date.now(),
): LiveAccessRow[] {
  const guild: PermissionGuild = {
    id: observed.guildId,
    ownerId: observed.ownerId ?? "",
    rolePermissions: new Map(
      observed.roles.map((role) => [role.id, role.permissions]),
    ),
  };
  const categories = new Map(
    observed.channels
      .filter((channel) => channel.type === ChannelType.GuildCategory)
      .map((channel) => [channel.id, channel.name]),
  );
  return observed.channels
    .filter((channel) => channel.type !== ChannelType.GuildCategory)
    .map((channel) => ({
      channelId: channel.id,
      name: channel.name,
      category: channel.parentId
        ? (categories.get(channel.parentId) ?? null)
        : null,
      access: accessLevel(
        channelPermissions(
          guild,
          { id: subject.memberId, roleIds: subject.roleIds },
          {
            type: channel.type,
            overwrites: (channel.overwrites ?? []).map((overwrite) => ({
              ...overwrite,
              kind: overwrite.kind ?? "role",
            })),
          },
          now,
        ),
      ),
    }));
}

const label: Record<AccessLevel, string> = {
  manage: "manage",
  write: "write",
  read: "read only",
  none: "none",
};

/** Compact grouped text, split into Discord-sized chunks. */
export function formatLiveAccess(
  rows: LiveAccessRow[],
  limit = 1_900,
): string[] {
  const visible = rows.filter((row) => row.access !== "none");
  const grouped = new Map<string, LiveAccessRow[]>();
  for (const row of visible) {
    const key = row.category ?? "(no category)";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const lines = [
    `Can see ${visible.length} of ${rows.length} channels.`,
    ...[...grouped].flatMap(([category, items]) => [
      `**${category}**`,
      ...items.map((item) => `• #${item.name} — ${label[item.access]}`),
    ]),
  ];
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n" : ""}${line}`;
  }
  if (current) chunks.push(current);
  return chunks;
}
