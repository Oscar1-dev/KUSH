import { requestUuid, type Ticket } from "../api-client.js";
import { embed } from "../panels.js";
import { hasAuthority } from "../runtime/authority.js";
import {
  CommandError,
  type CommandContext,
  type CommandDefinition,
} from "../runtime/command.js";
import { ticketCategory } from "./categories.js";
import { formatTranscript } from "./transcript.js";

const priorities = ["low", "normal", "high", "urgent"] as const;
const NUMBER = /^#?(\d{1,9})$/;
const MENTION = /^<@!?(\d{17,20})>$/;

const actorOf = (context: CommandContext) => ({
  discordUserId: context.actor.userId,
});

const inTicketChannel = (context: CommandContext) =>
  context.services.tickets.channels.has(context.channelId);

/**
 * The ticket a command refers to: an explicit number (`!claim 42`) or the
 * ticket whose private channel the command was typed in.
 */
async function resolveTicket(
  context: CommandContext,
  args: string[],
): Promise<{ ticket: Ticket; rest: string[] }> {
  const explicit = NUMBER.exec(args[0] ?? "");
  if (explicit) {
    const ticket = await context.services.api.ticketByNumber(
      actorOf(context),
      Number(explicit[1]),
    );
    return { ticket, rest: args.slice(1) };
  }
  if (inTicketChannel(context))
    return {
      ticket: await context.services.api.ticketByChannel(
        actorOf(context),
        context.channelId,
      ),
      rest: args,
    };
  throw new CommandError(
    "Run this inside a ticket channel, or give the ticket number, e.g. `!claim 42`.",
  );
}

/** Ticket outcomes: in the ticket's own private channel, otherwise privately. */
async function respond(context: CommandContext, content: string) {
  if (inTicketChannel(context)) await context.reply({ content });
  else {
    const delivery = await context.replyPrivately({ content });
    if (delivery === "unavailable")
      await context.reply({
        content:
          "Done. I couldn't DM you the details; use the slash command for a private reply.",
      });
  }
}

async function resync(context: CommandContext, ticketId: string) {
  const records = await context.services.api.ticketChannels("active");
  const record = records.find((item) => item.ticketId === ticketId);
  if (!record) return;
  const { accessFromRecord } = await import("./manager.js");
  await context.services.tickets.sync(accessFromRecord(record));
}

const describe = (ticket: Ticket) =>
  `#${ticket.number} · ${ticketCategory(ticket.category)?.label ?? ticket.category} · ${ticket.status.replaceAll("_", " ")} · ${ticket.priority}`;

export const ticketCommands: CommandDefinition[] = [
  {
    path: ["tickets"],
    group: "Support staff",
    authority: "everyone",
    allowRestricted: true,
    cooldownMs: 5_000,
    summary: "Your tickets (and the claim queue for staff)",
    usage: "!tickets",
    run: async (context) => {
      const mine = await context.services.api
        .listTickets(actorOf(context))
        .catch(() => []);
      const lines = [
        "**Your tickets**",
        ...(mine.length ? mine.slice(0, 20).map(describe) : ["None."]),
      ];
      if (hasAuthority(context.actor, "ticket-handler")) {
        const queue = await context.services.api
          .queue(actorOf(context))
          .catch(() => null);
        lines.push(
          "",
          "**Unclaimed queue**",
          ...(queue === null
            ? [
                "Unavailable: link your Discord account to your KUSH staff account.",
              ]
            : queue.length
              ? queue
                  .slice(0, 20)
                  .map(
                    (item) =>
                      `#${item.number} · ${ticketCategory(item.category)?.label ?? item.category} · ${item.priority} — \`!claim ${item.number}\``,
                  )
              : ["Nothing waiting."]),
        );
      }
      const delivery = await context.replyPrivately({
        embeds: [embed("Tickets", lines.join("\n").slice(0, 4000))],
      });
      if (context.source === "prefix")
        await context.reply({
          content:
            delivery === "dm"
              ? "I've sent your ticket list by direct message."
              : "I couldn't DM you. Use `/tickets` for a private reply.",
        });
    },
  },
  {
    path: ["claim"],
    group: "Support staff",
    authority: "ticket-handler",
    summary: "Claim a ticket from the queue",
    usage: "!claim [number]",
    run: async (context) => {
      // Unassigned staff cannot read the ticket yet, so claim by number or
      // channel and let the backend apply the queue rules.
      const explicit = NUMBER.exec(context.args[0] ?? "");
      if (!explicit && !inTicketChannel(context))
        throw new CommandError(
          "Give the ticket number, e.g. `!claim 42`, or run it in the ticket channel.",
        );
      const claimed = await context.services.api.claimBy(
        actorOf(context),
        explicit
          ? { number: Number(explicit[1]) }
          : { channelId: context.channelId },
      );
      await resync(context, claimed.id);
      await respond(
        context,
        `Ticket #${claimed.number} is now handled by <@${context.actor.userId}>.`,
      );
    },
  },
  {
    path: ["assign"],
    group: "Support staff",
    authority: "support-lead",
    summary: "Assign a ticket to a staff member",
    usage: "!assign <@staff | none> [number]",
    run: async (context) => {
      const target = context.args.find(
        (arg) => MENTION.test(arg) || arg === "none",
      );
      if (!target)
        throw new CommandError("Usage: `!assign <@staff | none> [number]`");
      const { ticket } = await resolveTicket(
        context,
        context.args.filter((arg) => arg !== target),
      );
      const assigneeId = target === "none" ? null : MENTION.exec(target)![1]!;
      const updated = await context.services.api.assign(
        actorOf(context),
        ticket.id,
        ticket.version,
        assigneeId,
      );
      await resync(context, updated.id);
      await respond(
        context,
        assigneeId
          ? `Ticket #${updated.number} assigned to <@${assigneeId}>.`
          : `Ticket #${updated.number} is unassigned and back in the queue.`,
      );
    },
  },
  {
    path: ["priority"],
    group: "Support staff",
    authority: "ticket-handler",
    summary: "Set ticket priority",
    usage: "!priority <low|normal|high|urgent> [number]",
    run: async (context) => {
      const level = context.args.find((arg) =>
        (priorities as readonly string[]).includes(arg.toLowerCase()),
      );
      if (!level)
        throw new CommandError(
          "Usage: `!priority <low|normal|high|urgent> [number]`",
        );
      const { ticket } = await resolveTicket(
        context,
        context.args.filter((arg) => arg !== level),
      );
      const updated = await context.services.api.patch(
        actorOf(context),
        ticket.id,
        {
          expectedVersion: ticket.version,
          priority: level.toLowerCase(),
        },
      );
      await respond(
        context,
        `Ticket #${updated.number} priority is now **${updated.priority}**.`,
      );
    },
  },
  {
    path: ["note"],
    group: "Support staff",
    authority: "ticket-handler",
    summary: "Add an internal note (never shown to the customer)",
    usage: "!note [number] <text>",
    run: async (context) => {
      // Remove the command at once: the customer can see this channel.
      await context.deleteTrigger?.().catch(() => undefined);
      const { ticket, rest } = await resolveTicket(context, context.args);
      const text = rest.join(" ").trim();
      if (!text) throw new CommandError("Usage: `!note [number] <text>`");
      await context.services.api.message(actorOf(context), ticket.id, {
        requestId: requestUuid(
          `note:${context.channelId}:${ticket.version}:${text}`,
        ),
        expectedVersion: ticket.version,
        kind: "note",
        content: text.slice(0, 10_000),
      });
      // Always private: a confirmation in the ticket channel would reveal the note.
      await context.replyPrivately({
        content: `Internal note saved on ticket #${ticket.number}.`,
      });
    },
  },
  {
    path: ["close"],
    group: "Support staff",
    authority: "everyone",
    allowRestricted: true,
    summary: "Close a ticket (customers can close their own)",
    usage: "!close [number] <reason>",
    run: async (context) => {
      const { ticket, rest } = await resolveTicket(context, context.args);
      const reason = rest.join(" ").trim() || "Closed from Discord";
      const closed = await context.services.api.close(
        actorOf(context),
        ticket.id,
        ticket.version,
        reason.slice(0, 2_000),
      );
      await resync(context, closed.id);
      await respond(
        context,
        `Ticket #${closed.number} is closed. The channel is now read-only; use \`!reopen\` if you need more help.`,
      );
    },
  },
  {
    path: ["reopen"],
    group: "Support staff",
    authority: "everyone",
    allowRestricted: true,
    summary: "Reopen a closed ticket",
    usage: "!reopen [number]",
    run: async (context) => {
      const { ticket } = await resolveTicket(context, context.args);
      const reopened = await context.services.api.reopen(
        actorOf(context),
        ticket.id,
        ticket.version,
      );
      await resync(context, reopened.id);
      await respond(context, `Ticket #${reopened.number} is open again.`);
    },
  },
  {
    path: ["transcript"],
    group: "Support staff",
    authority: "everyone",
    allowRestricted: true,
    cooldownMs: 15_000,
    summary: "Download a ticket transcript (sent privately)",
    usage: "!transcript [number]",
    run: async (context) => {
      const { ticket } = await resolveTicket(context, context.args);
      const transcript = await context.services.api.transcript(
        actorOf(context),
        ticket.id,
      );
      const delivery = await context.replyPrivately({
        content: `Transcript for ticket #${ticket.number}.`,
        files: [
          {
            attachment: Buffer.from(formatTranscript(transcript), "utf8"),
            name: `kush-ticket-${ticket.number}.txt`,
          },
        ],
      });
      if (context.source === "prefix")
        await context.reply({
          content:
            delivery === "dm"
              ? "I've sent the transcript by direct message."
              : "I couldn't DM you. Use `/transcript` for a private download.",
        });
    },
  },
];

/**
 * `/ticket close|claim|transcript` mirror the short commands (same handler,
 * same checks); `/ticket add` brings someone into this ticket's channel.
 */
const nested = (name: "close" | "claim" | "transcript") => {
  const base = ticketCommands.find((command) => command.path[0] === name)!;
  return {
    ...base,
    path: ["ticket", name],
    aliases: [],
    usage: base.usage.replace(`!${name}`, `!ticket ${name}`),
  } satisfies CommandDefinition;
};

ticketCommands.push(nested("close"), nested("claim"), nested("transcript"), {
  path: ["ticket", "add"],
  group: "Support staff",
  authority: "ticket-handler",
  summary: "Add someone to this ticket's conversation",
  usage: "!ticket add <@member>",
  options: [
    { name: "member", description: "Who to add", required: true, type: "user" },
  ],
  run: async (context) => {
    const id = MENTION.exec(context.args[0] ?? "")?.[1];
    if (!id) throw new CommandError("Usage: `!ticket add <@member>`");
    if (!inTicketChannel(context))
      throw new CommandError("Run this inside the ticket's channel.");
    const result = await context.services.api.addTicketParticipant(
      actorOf(context),
      context.channelId,
      id,
    );
    await resync(context, result.ticket.id);
    await context.reply({
      content: result.added
        ? `<@${id}> can now see and reply in ticket #${result.ticket.number}.`
        : `<@${id}> is already in this ticket.`,
    });
  },
});
