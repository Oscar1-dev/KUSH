import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
} from "discord.js";
import { card, type Tone } from "../panels.js";

/**
 * Rule watch: reads messages in member channels and reports likely rule
 * breaks to staff in #moderation-log, with one-tap actions (delete, warn,
 * timeout, dismiss). It never punishes on its own: a person decides.
 *
 * Detection is deliberately conservative (clear patterns only) so staff
 * trust the reports; anything subtle is still handled through !report.
 */

export type Severity = "high" | "medium" | "low";

export interface Finding {
  /** Stable ID, used for de-duplication. */
  key: string;
  /** Which server rule (see rulesText in panels.ts). */
  rule: number;
  label: string;
  detail: string;
  severity: Severity;
}

export interface MessageFacts {
  content: string;
  userMentions: number;
  roleMentions: number;
  /** Tried @everyone / @here (even without permission to ping). */
  everyone: boolean;
  /** The author's server display name (impersonation check). */
  displayName: string;
}

const INVITE =
  /\b(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg|discord\.me)\/([a-z0-9-]{2,32})/i;
const LINK = /https?:\/\/\S+/i;
const SCAM = [
  /free\s+(?:discord\s+)?nitro/i,
  /nitro\s+(?:for\s+)?free/i,
  /steam\s*(?:community)?\s*gift/i,
  /\b(?:claim|get)\s+your\s+(?:free\s+)?(?:gift|reward|prize|airdrop)/i,
  /\bairdrop\b.*\b(?:claim|connect\s+wallet)/i,
  /\bconnect\s+(?:your\s+)?wallet\b/i,
  /@everyone.*\b(?:gift|nitro|free)\b/i,
];
// Common shapes of product/licence keys (5x5, 4x4 alphanumerics).
const LICENCE_KEY =
  /\b(?:[A-Z0-9]{5}-){4}[A-Z0-9]{5}\b|\b(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}\b/;
const PIRACY =
  /\b(?:cracked|crack(?:ed)?\s+version|keygen|warez|nulled|leaked\s+(?:source|build))\b/i;
const HARASSMENT = [
  /\bk\s*y\s*s\b/i,
  /\bkill\s+your\s*self\b/i,
  /\bgo\s+die\b/i,
  /\bi(?:'ll| will)\s+(?:find|dox|hurt|kill)\s+you\b/i,
];
// Street addresses and phone numbers written the way people write them
// (+44 7700 900123, 07700 900123). Bare digit runs are not matched, so
// Discord IDs and order numbers don't trigger it.
const DOX =
  /\b\d{1,5}\s+[a-z]+\s+(?:street|road|avenue|lane|drive|close)\b|\+\d{1,3}[\s-]\d{2,5}[\s-]?\d{3,4}[\s-]?\d{3,4}\b|\b0\d{4}\s\d{6}\b/i;
const STAFF_NAME =
  /\b(?:kush\s*)?(?:staff|admin(?:istrator)?|moderator|mod\s*team|support\s*team|owner)\b/i;
const SUPPORT_TALK =
  /\b(?:refund|my\s+order|payment\s+(?:failed|issue)|licen[cs]e\s+(?:key\s+)?(?:not\s+working|invalid)|can'?t\s+download|download\s+(?:not\s+working|broken))\b/i;

/** Inspects one message. `ownInvites` are KUSH's own invite codes. */
export function detect(
  facts: MessageFacts,
  ownInvites: readonly string[] = [],
): Finding[] {
  const found: Finding[] = [];
  const text = facts.content;
  const invite = INVITE.exec(text);
  if (invite && !ownInvites.includes(invite[1]!.toLowerCase()))
    found.push({
      key: "invite",
      rule: 2,
      label: "Server advertising",
      detail: "Posted an invite to another Discord server.",
      severity: "medium",
    });
  if (
    SCAM.some((pattern) => pattern.test(text)) &&
    (LINK.test(text) || facts.everyone)
  )
    found.push({
      key: "scam",
      rule: 4,
      label: "Likely scam / malicious link",
      detail: "Matches a common free-Nitro / gift / wallet scam.",
      severity: "high",
    });
  if (LICENCE_KEY.test(text))
    found.push({
      key: "licence-key",
      rule: 4,
      label: "Licence key posted publicly",
      detail:
        "Looks like a product or licence key. Delete it and check whose key it is.",
      severity: "high",
    });
  if (PIRACY.test(text))
    found.push({
      key: "piracy",
      rule: 4,
      label: "Pirated software",
      detail: "Mentions cracked or pirated software.",
      severity: "medium",
    });
  if (HARASSMENT.some((pattern) => pattern.test(text)))
    found.push({
      key: "harassment",
      rule: 1,
      label: "Harassment / threat",
      detail: "Contains abusive or threatening language.",
      severity: "high",
    });
  if (DOX.test(text))
    found.push({
      key: "private-info",
      rule: 4,
      label: "Possible private information",
      detail: "Looks like a phone number or street address.",
      severity: "medium",
    });
  if (facts.userMentions + facts.roleMentions >= 5 || facts.everyone)
    found.push({
      key: "mass-mention",
      rule: 2,
      label: "Mass mention",
      detail: facts.everyone
        ? "Tried to ping @everyone or @here."
        : `Mentioned ${facts.userMentions + facts.roleMentions} people or roles in one message.`,
      severity: "medium",
    });
  if (STAFF_NAME.test(facts.displayName))
    found.push({
      key: "impersonation",
      rule: 3,
      label: "Possible staff impersonation",
      detail: `Display name "${facts.displayName.slice(0, 40)}" suggests a staff position they don't hold.`,
      severity: "medium",
    });
  if (SUPPORT_TALK.test(text))
    found.push({
      key: "support-public",
      rule: 5,
      label: "Support request in public",
      detail:
        "Looks like an order or support problem; it belongs in a private ticket.",
      severity: "low",
    });
  return found;
}

/**
 * Tracks message rate per member for flood detection, and how recently a
 * member was reported for each rule so staff aren't flooded either.
 */
export class RuleWatchTracker {
  readonly #recent = new Map<string, { at: number; text: string }[]>();
  readonly #reported = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    /** One report per member per rule within this window. */
    private readonly reportEveryMs = 10 * 60_000,
  ) {}

  /** Records a message; returns a flood finding when one is detected. */
  flood(userId: string, text: string): Finding | null {
    const at = this.now();
    const history = (this.#recent.get(userId) ?? []).filter(
      (item) => at - item.at < 60_000,
    );
    history.push({ at, text: text.trim().toLowerCase() });
    this.#recent.set(userId, history);
    const burst = history.filter((item) => at - item.at < 8_000).length;
    const repeats = history.filter(
      (item) => item.text && item.text === history.at(-1)!.text,
    ).length;
    if (burst >= 6 || repeats >= 4)
      return {
        key: "flood",
        rule: 2,
        label: "Spam / flooding",
        detail:
          repeats >= 4
            ? `Sent the same message ${repeats} times in a minute.`
            : `Sent ${burst} messages in 8 seconds.`,
        severity: "medium",
      };
    return null;
  }

  /** True when this member/rule pair should be reported now. */
  shouldReport(userId: string, key: string) {
    const id = `${userId}:${key}`;
    const last = this.#reported.get(id);
    if (last !== undefined && this.now() - last < this.reportEveryMs)
      return false;
    this.#reported.set(id, this.now());
    return true;
  }

  sweep() {
    const at = this.now();
    for (const [id, history] of this.#recent)
      if (!history.some((item) => at - item.at < 60_000))
        this.#recent.delete(id);
    for (const [id, last] of this.#reported)
      if (at - last >= this.reportEveryMs) this.#reported.delete(id);
  }
}

const severityStyle: Record<Severity, { emoji: string; tone: Tone }> = {
  high: { emoji: "🚨", tone: "danger" },
  medium: { emoji: "⚠️", tone: "warning" },
  low: { emoji: "ℹ️", tone: "info" },
};

export const RULE_WATCH_PREFIX = "rw";
export type RuleWatchAction = "delete" | "warn" | "timeout" | "dismiss";

/** Plain (unsigned) IDs: every click re-checks the clicker is a moderator. */
export const ruleWatchButtonId = (
  action: RuleWatchAction,
  report: {
    channelId: string;
    messageId: string;
    userId: string;
    rule: number;
  },
) =>
  [
    RULE_WATCH_PREFIX,
    action,
    report.channelId,
    report.messageId,
    report.userId,
    report.rule,
  ].join(":");

export function parseRuleWatchButton(customId: string) {
  const match =
    /^rw:(delete|warn|timeout|dismiss):(\d{17,20}):(\d{17,20}):(\d{17,20}):(\d)$/.exec(
      customId,
    );
  return match
    ? {
        action: match[1] as RuleWatchAction,
        channelId: match[2]!,
        messageId: match[3]!,
        userId: match[4]!,
        rule: Number(match[5]),
      }
    : null;
}

export function reportMessage(input: {
  findings: Finding[];
  userId: string;
  channelId: string;
  messageId: string;
  guildId: string;
  excerpt: string;
}): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const worst = input.findings.some((f) => f.severity === "high")
    ? "high"
    : input.findings.some((f) => f.severity === "medium")
      ? "medium"
      : "low";
  const main = input.findings[0]!;
  const style = severityStyle[worst];
  const link = `https://discord.com/channels/${input.guildId}/${input.channelId}/${input.messageId}`;
  const ids = {
    channelId: input.channelId,
    messageId: input.messageId,
    userId: input.userId,
    rule: main.rule,
  };
  return {
    embeds: [
      card({
        emoji: style.emoji,
        title: `Rule ${main.rule}: ${main.label}`,
        tone: style.tone,
        description: input.findings
          .map((f) => `• **${f.label}** (rule ${f.rule}): ${f.detail}`)
          .join("\n"),
        fields: [
          {
            name: "Member",
            value: `<@${input.userId}>\n\`${input.userId}\``,
            inline: true,
          },
          {
            name: "Channel",
            value: `<#${input.channelId}>\n[Jump to message](${link})`,
            inline: true,
          },
          { name: "Severity", value: worst.toUpperCase(), inline: true },
          {
            name: "Message",
            value: input.excerpt
              ? `>>> ${input.excerpt.slice(0, 700)}`
              : "*(no text: attachment or embed)*",
          },
        ],
        footer:
          "KUSH • Rule watch • A moderator decides; nothing was done automatically",
        timestamp: true,
      }),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ruleWatchButtonId("delete", ids))
          .setLabel("Delete message")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(ruleWatchButtonId("warn", ids))
          .setLabel("Warn")
          .setEmoji("⚠️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ruleWatchButtonId("timeout", ids))
          .setLabel("Timeout 10 min")
          .setEmoji("🔇")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ruleWatchButtonId("dismiss", ids))
          .setLabel("Dismiss")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
      ),
    ],
  };
}
