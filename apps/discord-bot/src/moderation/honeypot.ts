import type { GuildMember, Message } from "discord.js";
import type { RoleKey } from "../blueprint.js";
import { embed, kushColours } from "../panels.js";
import type { Actor } from "../runtime/authority.js";
import type { BotServices } from "../runtime/command.js";

export const HONEYPOT_CHANNEL_KEY = "information:do-not-post";
export const HONEYPOT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

const exemptRoles: readonly RoleKey[] = [
  "owner",
  "administrator",
  "developer",
  "support-lead",
  "support-staff",
  "moderator",
  "kush-bot",
];

/** Staff and the guild owner may post (e.g. to pin the warning). */
export const isHoneypotExempt = (actor: Actor) =>
  actor.isGuildOwner || exemptRoles.some((role) => actor.roles.has(role));

export type HoneypotOutcome = "exempt" | "timed-out" | "deleted-only";

/**
 * Removes the message and times the author out for human review. A timeout
 * is reversible (unlike a ban) and is logged to the moderation log with
 * enough context to judge a false positive.
 */
export async function handleHoneypotMessage(
  message: Message<true>,
  member: GuildMember,
  actor: Actor,
  services: BotServices,
): Promise<HoneypotOutcome> {
  if (isHoneypotExempt(actor)) return "exempt";
  await message.delete().catch(() => undefined);
  let outcome: HoneypotOutcome = "deleted-only";
  if (member.moderatable) {
    await member.timeout(
      HONEYPOT_TIMEOUT_MS,
      "Posted in the #do-not-post honeypot",
    );
    outcome = "timed-out";
  }
  services.audit({
    action: "moderation.honeypot",
    actorId: member.id,
    outcome: "ok",
    detail: { action: outcome },
  });
  const logChannelId =
    services.config.channelIds["staff:moderation-log"] ??
    services.config.channelIds["08-staff-operations:moderation-log"];
  const channel = logChannelId
    ? message.guild.channels.cache.get(logChannelId)
    : undefined;
  if (channel?.isSendable())
    await channel
      .send({
        embeds: [
          embed(
            "Honeypot triggered",
            [
              `Member: <@${member.id}> (${member.user.tag})`,
              `Account created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
              `Joined: ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "unknown"}`,
              `Action: ${outcome === "timed-out" ? "message deleted, 24 h timeout" : "message deleted (member not moderatable)"}`,
              `Content (truncated): ${message.content.slice(0, 300) || "(no text)"}`,
              "Review and remove the timeout if this was a mistake.",
            ].join("\n"),
          ).setColor(kushColours.warning),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => undefined);
  return outcome;
}
