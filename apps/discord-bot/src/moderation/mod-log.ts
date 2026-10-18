import {
  AuditLogEvent,
  Events,
  type Client,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildMember,
} from "discord.js";
import { card, type Tone } from "../panels.js";
import type { Logger } from "../runtime/logger.js";

/**
 * Structured moderation log and welcome cards.
 *
 * Moderation entries come from Discord's own audit log, so every action is
 * captured whether staff used Discord's tools or the bot: bans, unbans,
 * kicks, timeouts and messages deleted by a moderator. (Needs the bot to
 * hold View Audit Log; without it Discord simply sends no events.)
 */

type ModKind = "ban" | "unban" | "kick" | "timeout" | "untimeout" | "delete";

const style: Record<ModKind, { emoji: string; title: string; tone: Tone }> = {
  ban: { emoji: "🔨", title: "Member banned", tone: "danger" },
  unban: { emoji: "♻️", title: "Ban lifted", tone: "success" },
  kick: { emoji: "👢", title: "Member kicked", tone: "warning" },
  timeout: { emoji: "🔇", title: "Member timed out", tone: "warning" },
  untimeout: { emoji: "🔊", title: "Timeout removed", tone: "success" },
  delete: { emoji: "🗑️", title: "Message deleted", tone: "danger" },
};

const who = (id: string | null | undefined) =>
  id ? `<@${id}>\n\`${id}\`` : "Unknown";

export function modLogCard(input: {
  kind: ModKind;
  targetId: string | null;
  moderatorId: string | null;
  reason: string | null;
  extra?: { name: string; value: string; inline?: boolean }[];
}) {
  const s = style[input.kind];
  return card({
    emoji: s.emoji,
    title: s.title,
    tone: s.tone,
    fields: [
      { name: "User", value: who(input.targetId), inline: true },
      { name: "Moderator", value: who(input.moderatorId), inline: true },
      ...(input.extra ?? []),
      {
        name: "Reason",
        value: (input.reason ?? "No reason given").slice(0, 1_000),
      },
    ],
    footer: "KUSH • Moderation log",
    timestamp: true,
  });
}

/** Maps an audit-log entry to a log card, or null if it is not logged. */
export function cardForEntry(
  entry: Pick<
    GuildAuditLogsEntry,
    "action" | "targetId" | "executorId" | "reason" | "changes" | "extra"
  >,
) {
  const base = {
    targetId: entry.targetId,
    moderatorId: entry.executorId,
    reason: entry.reason,
  };
  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      return modLogCard({ kind: "ban", ...base });
    case AuditLogEvent.MemberBanRemove:
      return modLogCard({ kind: "unban", ...base });
    case AuditLogEvent.MemberKick:
      return modLogCard({ kind: "kick", ...base });
    case AuditLogEvent.MemberUpdate: {
      const change = entry.changes.find(
        (c) => c.key === "communication_disabled_until",
      );
      if (!change) return null;
      const until = change.new ? String(change.new) : null;
      return until
        ? modLogCard({
            kind: "timeout",
            ...base,
            extra: [
              {
                name: "Until",
                value: `<t:${Math.floor(Date.parse(until) / 1000)}:F>`,
                inline: true,
              },
            ],
          })
        : modLogCard({ kind: "untimeout", ...base });
    }
    case AuditLogEvent.MessageDelete: {
      const extra = entry.extra as {
        channel?: { id: string };
        count?: number;
      } | null;
      return modLogCard({
        kind: "delete",
        ...base,
        extra: [
          ...(extra?.channel
            ? [
                {
                  name: "Channel",
                  value: `<#${extra.channel.id}>`,
                  inline: true,
                },
              ]
            : []),
          ...(extra?.count && extra.count > 1
            ? [{ name: "Messages", value: String(extra.count), inline: true }]
            : []),
        ],
      });
    }
    default:
      return null;
  }
}

/** The member-joined card for #welcome. */
export function welcomeCard(
  member: Pick<GuildMember, "id" | "displayAvatarURL" | "user" | "guild">,
  links: { rules?: string; support?: string },
) {
  const created = Math.floor(member.user.createdTimestamp / 1000);
  return card({
    emoji: "👋",
    title: "Member joined",
    tone: "brand",
    description: [
      `Welcome to **KUSH**, <@${member.id}>!`,
      "",
      `📜 Read the rules${links.rules ? ` in <#${links.rules}>` : ""} and press **I accept** to join the community.`,
      `🎫 Need help? Open a private ticket${links.support ? ` in <#${links.support}>` : ""}.`,
    ].join("\n"),
    fields: [
      { name: "Member ID", value: `\`${member.id}\``, inline: true },
      { name: "Account created", value: `<t:${created}:R>`, inline: true },
      {
        name: "Members",
        value: String(member.guild.memberCount),
        inline: true,
      },
    ],
    thumbnail: member.displayAvatarURL({ size: 256 }),
    footer: "KUSH • Software, development & creative services",
    timestamp: true,
  });
}

export function registerModLog(
  client: Client,
  config: { guildId: string; channelIds: Record<string, string> },
  log: Logger,
) {
  const channelId = config.channelIds["staff:moderation-log"];
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild: Guild) => {
    if (guild.id !== config.guildId || !channelId) return;
    // The bot's own actions (e.g. honeypot removals) post their own cards.
    if (entry.executorId === client.user?.id) return;
    const embed = cardForEntry(entry);
    if (!embed) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isSendable()) return;
    void channel
      .send({ embeds: [embed], allowedMentions: { parse: [] } })
      .catch((error: unknown) =>
        log.warn("modlog.post.failed", {
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
  });
}
