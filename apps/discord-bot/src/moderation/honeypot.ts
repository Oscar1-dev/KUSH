import type { GuildMember, Message } from "discord.js";
import type { RoleKey } from "../blueprint.js";
import { embed, kushColours } from "../panels.js";
import type { Actor } from "../runtime/authority.js";
import type { BotServices } from "../runtime/command.js";

export const HONEYPOT_CHANNEL_KEY = "information:do-not-post";

/**
 * Honeypot policy. A single post is treated as a mistake, not an offence:
 * the message is removed, the member is told why, and moderators are
 * notified for review. Restrictions only escalate on repetition, because
 * legitimate members do wander into channels.
 */
export interface HoneypotPolicy {
  /** Triggers within the window before any restriction applies. */
  strikesBeforeTimeout: number;
  windowMs: number;
  /** Timeout applied once the threshold is passed. */
  timeoutMs: number;
  /** Minimum gap between moderator notifications about the same member. */
  notifyEveryMs: number;
}

export const defaultHoneypotPolicy: HoneypotPolicy = {
  strikesBeforeTimeout: 3,
  windowMs: 60 * 60_000,
  timeoutMs: 60 * 60_000,
  notifyEveryMs: 10 * 60_000,
};

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

export interface HoneypotResult {
  outcome: "exempt" | "recorded" | "restricted";
  strikes: number;
  deleted: boolean;
  notified: boolean;
}

/**
 * Tracks repeat triggers per member. In memory by design: the window is an
 * hour, and a restart clearing it errs towards leniency. Durable moderation
 * cases belong in the backend moderation records.
 */
export class HoneypotTracker {
  readonly #triggers = new Map<string, number[]>();
  readonly #notifiedAt = new Map<string, number>();

  constructor(
    private readonly policy: HoneypotPolicy = defaultHoneypotPolicy,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a trigger and reports whether it reaches the threshold. */
  record(userId: string): { strikes: number; restrict: boolean } {
    const now = this.now();
    const recent = [...this.#recent(userId, now), now];
    this.#triggers.set(userId, recent);
    return {
      strikes: recent.length,
      restrict: recent.length >= this.policy.strikesBeforeTimeout,
    };
  }

  shouldNotify(userId: string): boolean {
    const now = this.now();
    const last = this.#notifiedAt.get(userId);
    if (last !== undefined && last > now - this.policy.notifyEveryMs)
      return false;
    this.#notifiedAt.set(userId, now);
    return true;
  }

  sweep(): void {
    const now = this.now();
    for (const key of [...this.#triggers.keys()])
      if (!this.#recent(key, now).length) this.#triggers.delete(key);
    for (const [key, time] of this.#notifiedAt)
      if (time <= now - this.policy.notifyEveryMs) this.#notifiedAt.delete(key);
  }

  #recent(userId: string, now: number): number[] {
    return (this.#triggers.get(userId) ?? []).filter(
      (time) => time > now - this.policy.windowMs,
    );
  }
}

/**
 * Handles a message in the honeypot channel: remove it, tell the member,
 * record the trigger and notify moderators. A timeout is applied only after
 * repeated triggers inside the policy window.
 */
export async function handleHoneypotMessage(
  message: Message<true>,
  member: GuildMember,
  actor: Actor,
  services: BotServices,
  tracker: HoneypotTracker,
  policy: HoneypotPolicy = defaultHoneypotPolicy,
): Promise<HoneypotResult> {
  if (isHoneypotExempt(actor))
    return { outcome: "exempt", strikes: 0, deleted: false, notified: false };

  const deleted = await message
    .delete()
    .then(() => true)
    .catch(() => false);
  const { strikes, restrict } = tracker.record(member.id);

  let restricted = false;
  if (restrict && member.moderatable) {
    await member
      .timeout(
        policy.timeoutMs,
        `Repeated posts in #do-not-post (${strikes} in ${Math.round(policy.windowMs / 60_000)} minutes)`,
      )
      .then(() => {
        restricted = true;
      })
      .catch(() => undefined);
  }

  // Tell the member what happened, so an accidental post is not a mystery.
  await member
    .send({
      embeds: [
        embed(
          "Your message was removed",
          [
            `You posted in **#${message.channel.name}** in the KUSH server. That channel exists only to catch spam and compromised accounts, so messages there are removed automatically.`,
            restricted
              ? `Because this has happened ${strikes} times, you have been temporarily muted while staff review it.`
              : "No action has been taken against your account.",
            "If this was a mistake, you can carry on as normal. If you think something is wrong, open a ticket with `!ticket`.",
          ].join("\n\n"),
        ).setColor(kushColours.warning),
      ],
    })
    .catch(() => undefined);

  services.audit({
    action: "moderation.honeypot",
    actorId: member.id,
    outcome: "ok",
    detail: {
      strikes,
      deleted,
      restricted,
    },
  });

  const notified = tracker.shouldNotify(member.id);
  if (notified) {
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
              restricted ? "Honeypot: member restricted" : "Honeypot triggered",
              [
                `Member: <@${member.id}>`,
                `Triggers in the last ${Math.round(policy.windowMs / 60_000)} minutes: ${strikes}`,
                `Account created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                `Message removed: ${deleted ? "yes" : "no (missing permission)"}`,
                restricted
                  ? `Timed out for ${Math.round(policy.timeoutMs / 60_000)} minutes — remove the timeout if this looks accidental.`
                  : "No restriction applied. Review and act manually if this looks like abuse.",
              ].join("\n"),
            ).setColor(kushColours.warning),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => undefined);
  }

  return {
    outcome: restricted ? "restricted" : "recorded",
    strikes,
    deleted,
    notified,
  };
}
