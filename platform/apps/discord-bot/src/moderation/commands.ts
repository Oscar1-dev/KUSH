import { DiscordAPIError, type EmbedBuilder } from "discord.js";
import { ApiError, type CaseKind, type ModerationCase } from "../api-client.js";
import { roles as blueprintRoles } from "../blueprint.js";
import { card } from "../panels.js";
import { hasAuthority, roleKeysFor } from "../runtime/authority.js";
import {
  CommandError,
  type CommandContext,
  type CommandDefinition,
} from "../runtime/command.js";
import { modLogCard } from "./mod-log.js";

/**
 * Moderation commands with numbered cases.
 *
 * Order matters: the member is told first (a kicked or banned member can no
 * longer receive a DM from the server), then Discord carries out the
 * action, and only then is the case recorded, so a failed action never
 * leaves a phantom case. The bot's own actions are skipped by the audit-log
 * listener, so each action produces exactly one case and one log card.
 */

/** Discord surface for moderation (discord.js in production, a fake in tests). */
export interface ModerationGateway {
  /** Null when the user is not in the server. */
  member(userId: string): Promise<{
    roleIds: string[];
    isOwner: boolean;
    isBot: boolean;
  } | null>;
  /** Whether the bot itself holds the permission this action needs. */
  permitted(kind: CaseKind): boolean;
  timeout(userId: string, ms: number | null, reason: string): Promise<void>;
  kick(userId: string, reason: string): Promise<void>;
  ban(userId: string, reason: string): Promise<void>;
  unban(userId: string, reason: string): Promise<void>;
  /** DMs the member; false when their DMs are closed. */
  notify(userId: string, message: EmbedBuilder): Promise<boolean>;
  /** Posts to the staff moderation log. */
  log(message: EmbedBuilder): Promise<void>;
  /** Removes these roles from a member (offboarding). */
  removeRoles(userId: string, roleIds: string[], reason: string): Promise<void>;
  /** Posts a card to a channel; returns the message ID. */
  post(channelId: string, message: EmbedBuilder): Promise<string | null>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
}

const MENTION = /^<@!?(\d{17,20})>$|^(\d{17,20})$/;
const MAX_TIMEOUT_MINUTES = 40_320; // Discord's limit: 28 days.
const roleKeys = blueprintRoles.map((role) => role.key);

const userIdFrom = (token: string | undefined) => {
  const match = token ? MENTION.exec(token) : null;
  return match ? (match[1] ?? match[2]!) : null;
};

const gateway = (context: CommandContext) => {
  const found = context.services.moderation;
  if (!found)
    throw new CommandError(
      "Moderation is still starting up. Try again in a moment.",
    );
  return found;
};

const reasonFrom = (args: string[], required: boolean) => {
  const reason = args.join(" ").trim().slice(0, 1_000);
  if (!reason && required)
    throw new CommandError("Please give a reason; it is kept on the case.");
  return reason || "No reason given";
};

/** Refuses self-action, the bot, the owner and fellow staff. */
async function checkTarget(
  context: CommandContext,
  targetId: string,
  { mustBeMember }: { mustBeMember: boolean },
) {
  if (targetId === context.actor.userId)
    throw new CommandError("You can't take moderation action on yourself.");
  const member = await gateway(context).member(targetId);
  if (!member) {
    if (mustBeMember) throw new CommandError("That user isn't in the server.");
    return;
  }
  if (member.isBot) throw new CommandError("Bots can't be moderated here.");
  if (member.isOwner)
    throw new CommandError("The server owner can't be moderated.");
  const target = {
    userId: targetId,
    displayName: "",
    roles: roleKeysFor(
      member.roleIds,
      context.services.config.roleIds,
      roleKeys,
    ),
    isGuildOwner: false,
  };
  if (
    hasAuthority(target, "moderator") ||
    hasAuthority(target, "ticket-handler")
  )
    throw new CommandError(
      "That member is KUSH staff. Staff discipline goes through an administrator, not moderation commands.",
    );
}

const memberNotice = (kind: CaseKind, reason: string, extra?: string) => {
  const text: Partial<Record<CaseKind, [string, string]>> = {
    warn: ["⚠️", "You received a warning in KUSH"],
    timeout: ["🔇", "You were timed out in KUSH"],
    kick: ["👢", "You were removed from KUSH"],
    ban: ["🔨", "You were banned from KUSH"],
  };
  const [emoji, title] = text[kind] ?? ["ℹ️", "KUSH moderation notice"];
  return card({
    emoji,
    title,
    tone: kind === "warn" || kind === "timeout" ? "warning" : "danger",
    description: [
      `**Reason:** ${reason}`,
      ...(extra ? [extra] : []),
      "",
      kind === "ban"
        ? "If you believe this is a mistake, contact KUSH through the website."
        : "If you think this was a mistake, open a ticket and a staff member will review it.",
    ].join("\n"),
    timestamp: true,
  });
};

/** Records the case, posts the log card and confirms to the moderator. */
async function finish(
  context: CommandContext,
  input: {
    kind: CaseKind;
    targetId: string;
    reason: string;
    durationSeconds?: number;
    notified?: boolean;
  },
) {
  let recorded: ModerationCase | null = null;
  try {
    recorded = await context.services.api.recordCase({
      kind: input.kind,
      targetId: input.targetId,
      moderatorId: context.actor.userId,
      reason: input.reason,
      ...(input.durationSeconds
        ? { durationSeconds: input.durationSeconds }
        : {}),
      source: "bot",
    });
  } catch (error) {
    context.services.log.error("moderation.case.failed", {
      kind: input.kind,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
  await gateway(context)
    .log(
      modLogCard({
        kind: input.kind,
        targetId: input.targetId,
        moderatorId: context.actor.userId,
        reason: input.reason,
        caseNumber: recorded?.number,
        extra: input.durationSeconds
          ? [
              {
                name: "Duration",
                value: duration(input.durationSeconds),
                inline: true,
              },
            ]
          : [],
      }),
    )
    .catch(() => undefined);
  const notice =
    input.notified === undefined
      ? ""
      : input.notified
        ? " They were notified by DM."
        : " Their DMs are closed, so they weren't notified.";
  await context.reply({
    content: recorded
      ? `✅ Case **#${recorded.number}** recorded: ${input.kind} for <@${input.targetId}>.${notice}`
      : `⚠️ The ${input.kind} went through, but the case couldn't be saved. Staff have been alerted in the logs.${notice}`,
  });
}

export const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1_440)} d`;
};

const missingPermission = (kind: CaseKind) =>
  new CommandError(
    `I don't have permission to ${kind} members (or they rank above me), so nothing was done. Use Discord's own ${kind} option instead; it is still logged as a numbered case automatically.`,
  );

/** One action command: target, optional extra parse, act, record. */
const action = (input: {
  kind: CaseKind;
  /** Command name when it differs from the case kind. */
  name?: string;
  summary: string;
  usage: string;
  authority?: CommandDefinition["authority"];
  mustBeMember?: boolean;
  notify?: boolean;
  run(
    context: CommandContext,
    targetId: string,
    rest: string[],
  ): Promise<{ reason: string; durationSeconds?: number }>;
}): CommandDefinition => ({
  path: [input.name ?? input.kind],
  group: "Moderation",
  authority: input.authority ?? "moderator",
  summary: input.summary,
  usage: input.usage,
  options: [
    {
      name: "arguments",
      description: input.usage.replace(/^!\S+\s*/, ""),
      required: true,
    },
  ],
  run: async (context) => {
    const targetId = userIdFrom(context.args[0]);
    if (!targetId) throw new CommandError(`Usage: \`${input.usage}\``);
    await checkTarget(context, targetId, {
      mustBeMember: input.mustBeMember ?? true,
    });
    const result = await input.run(context, targetId, context.args.slice(1));
    // Checked before the DM, so nobody is told about an action that can't happen.
    if (!gateway(context).permitted(input.kind))
      throw missingPermission(input.kind);
    let notified: boolean | undefined;
    if (input.notify)
      notified = await gateway(context)
        .notify(
          targetId,
          memberNotice(
            input.kind,
            result.reason,
            result.durationSeconds
              ? `**Duration:** ${duration(result.durationSeconds)}`
              : undefined,
          ),
        )
        .catch(() => false);
    try {
      await act(context, input.kind, targetId, result);
    } catch (error) {
      // 50013: Missing Permissions. By design the bot holds no Kick/Ban
      // Members (least privilege); Discord's own tools still create a case.
      if (error instanceof DiscordAPIError && error.code === 50013)
        throw missingPermission(input.kind);
      throw error;
    }
    await finish(context, {
      kind: input.kind,
      targetId,
      ...result,
      ...(notified === undefined ? {} : { notified }),
    });
  },
});

async function act(
  context: CommandContext,
  kind: CaseKind,
  targetId: string,
  { reason, durationSeconds }: { reason: string; durationSeconds?: number },
) {
  const discord = gateway(context);
  const audit =
    `${context.actor.displayName || context.actor.userId}: ${reason}`.slice(
      0,
      500,
    );
  if (kind === "timeout")
    await discord.timeout(targetId, durationSeconds! * 1_000, audit);
  else if (kind === "untimeout") await discord.timeout(targetId, null, audit);
  else if (kind === "kick") await discord.kick(targetId, audit);
  else if (kind === "ban") await discord.ban(targetId, audit);
  else if (kind === "unban") await discord.unban(targetId, audit);
}

const caseLine = (item: ModerationCase) => {
  const at = Math.floor(Date.parse(item.createdAt) / 1_000);
  const by = item.moderatorId ? `<@${item.moderatorId}>` : "Discord";
  return `**#${item.number}** · ${item.kind}${item.durationSeconds ? ` (${duration(item.durationSeconds)})` : ""} · <t:${at}:d> · by ${by}\n> ${item.reason.slice(0, 180)}`;
};

export const moderationCommands: CommandDefinition[] = [
  action({
    kind: "warn",
    summary: "Warn a member (recorded as a case)",
    usage: "!warn @member <reason>",
    notify: true,
    run: async (_context, _target, rest) => ({
      reason: reasonFrom(rest, true),
    }),
  }),
  action({
    kind: "timeout",
    summary: "Time out a member for some minutes",
    usage: "!timeout @member <minutes> <reason>",
    notify: true,
    run: async (_context, _target, [minutes, ...rest]) => {
      const value = Number(minutes);
      if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MINUTES)
        throw new CommandError(
          `Minutes must be a whole number from 1 to ${MAX_TIMEOUT_MINUTES} (28 days).`,
        );
      return { reason: reasonFrom(rest, true), durationSeconds: value * 60 };
    },
  }),
  action({
    kind: "untimeout",
    summary: "Remove a member's timeout",
    usage: "!untimeout @member [reason]",
    run: async (_context, _target, rest) => ({
      reason: reasonFrom(rest, false),
    }),
  }),
  action({
    kind: "kick",
    summary: "Remove a member from the server",
    usage: "!kick @member <reason>",
    notify: true,
    run: async (_context, _target, rest) => ({
      reason: reasonFrom(rest, true),
    }),
  }),
  action({
    kind: "ban",
    summary: "Ban a member or user ID",
    usage: "!ban <@member | user ID> <reason>",
    mustBeMember: false,
    notify: true,
    run: async (_context, _target, rest) => ({
      reason: reasonFrom(rest, true),
    }),
  }),
  action({
    kind: "unban",
    summary: "Lift a ban by user ID",
    usage: "!unban <user ID> [reason]",
    mustBeMember: false,
    run: async (_context, _target, rest) => ({
      reason: reasonFrom(rest, false),
    }),
  }),
  action({
    kind: "note",
    // !note is taken by ticket notes.
    name: "modnote",
    summary: "Add a private staff note to a member's record",
    usage: "!modnote @member <note>",
    mustBeMember: false,
    run: async (_context, _target, rest) => ({
      reason: reasonFrom(rest, true),
    }),
  }),
  {
    path: ["cases"],
    group: "Moderation",
    authority: "moderator",
    summary: "A member's moderation history",
    usage: "!cases <@member | user ID>",
    options: [
      { name: "arguments", description: "@member or user ID", required: true },
    ],
    run: async (context) => {
      const targetId = userIdFrom(context.args[0]);
      if (!targetId)
        throw new CommandError("Usage: `!cases <@member | user ID>`");
      const cases = await context.services.api.listCases(targetId, 10);
      await context.reply({
        embeds: [
          card({
            emoji: "📁",
            title: "Moderation history",
            tone: cases.length ? "warning" : "success",
            description: [
              `<@${targetId}> · \`${targetId}\``,
              "",
              cases.length
                ? cases.map(caseLine).join("\n\n")
                : "No cases on record. ✨",
            ]
              .join("\n")
              .slice(0, 4_000),
            footer:
              cases.length === 10
                ? "KUSH • Showing the 10 most recent"
                : "KUSH • Moderation",
          }),
        ],
      });
    },
  },
  {
    path: ["case"],
    group: "Moderation",
    authority: "moderator",
    summary: "View one moderation case",
    usage: "!case <number>",
    options: [
      { name: "arguments", description: "Case number", required: true },
    ],
    run: async (context) => {
      const number = Number(context.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(number) || number < 1)
        throw new CommandError("Usage: `!case <number>`");
      const item = await context.services.api
        .getCase(number)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404)
            throw new CommandError(`There is no case #${number}.`);
          throw error;
        });
      await context.reply({
        embeds: [
          modLogCard({
            kind: item.kind,
            targetId: item.targetId,
            moderatorId: item.moderatorId,
            reason: item.reason,
            caseNumber: item.number,
            extra: [
              ...(item.durationSeconds
                ? [
                    {
                      name: "Duration",
                      value: duration(item.durationSeconds),
                      inline: true,
                    },
                  ]
                : []),
              {
                name: "Recorded",
                value: `<t:${Math.floor(Date.parse(item.createdAt) / 1_000)}:F> via ${item.source === "bot" ? "bot command" : "Discord"}`,
                inline: true,
              },
            ],
          }),
        ],
      });
    },
  },
];
