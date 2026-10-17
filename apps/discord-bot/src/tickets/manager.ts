import { PermissionFlagsBits as P } from "discord.js";
import type {
  DiscordApiClient,
  Ticket,
  TicketChannelRecord,
  TicketQueue,
} from "../api-client.js";
import {
  configuredRoleId,
  ticketChannelOverwrites,
  type RoleKey,
} from "../blueprint.js";
import type { ResolvedOverwrite } from "../provisioning.js";
import type { Logger } from "../runtime/logger.js";
import { ticketCategory } from "./categories.js";

/** Minimal Discord surface for ticket channels (discord.js or a test fake). */
export interface TicketDiscord {
  createChannel(input: {
    name: string;
    parentId: string | null;
    topic: string;
    overwrites: ResolvedOverwrite[];
  }): Promise<string>;
  channelExists(channelId: string): Promise<boolean>;
  setOverwrites(
    channelId: string,
    overwrites: ResolvedOverwrite[],
  ): Promise<void>;
  rename(channelId: string, name: string): Promise<void>;
  send(
    channelId: string,
    message: { content: string; mentionUserIds?: string[] },
  ): Promise<void>;
}

export interface TicketManagerConfig {
  guildId: string;
  /** Resolved lazily: the bot's integration role is known once the gateway is ready. */
  botRoleId: () => string | undefined;
  roleIds: Record<string, string>;
  channelIds: Record<string, string>;
}

export interface TicketAccess {
  channelId: string;
  queue: TicketQueue;
  number: number;
  creatorId: string | null;
  assigneeIds: string[];
  closed: boolean;
}

const pad = (number: number) => String(number).padStart(4, "0");
export const ticketChannelName = (
  queue: TicketQueue,
  number: number,
  closed = false,
) =>
  `${closed ? "closed" : queue === "reports" ? "report" : "ticket"}-${pad(number)}`;

const readOnly = P.ViewChannel | P.ReadMessageHistory;

/**
 * Keeps each ticket's private Discord channel in line with backend state.
 * The backend is authoritative; channel visibility is presentation. Any
 * principal that cannot be resolved is left out, which can only reduce
 * access — @everyone (the guild ID) and the bot role always resolve.
 */
export class TicketManager {
  /** channelId → ticketId for mirroring and channel-scoped commands. */
  readonly channels = new Map<
    string,
    { ticketId: string; queue: TicketQueue }
  >();

  constructor(
    private readonly discord: TicketDiscord,
    private readonly api: DiscordApiClient,
    private readonly config: TicketManagerConfig,
    private readonly log: Logger,
  ) {}

  overwritesFor(
    access: Omit<TicketAccess, "channelId" | "number">,
  ): ResolvedOverwrite[] {
    const desired = ticketChannelOverwrites({
      kind: access.queue === "reports" ? "report" : "support",
      creatorId: access.creatorId ?? "",
      assigneeIds: access.assigneeIds,
    });
    const resolved: ResolvedOverwrite[] = [];
    for (const overwrite of desired) {
      const principal = overwrite.principal;
      if (typeof principal === "object") {
        if (!principal.memberId) continue;
        // Closed tickets stay readable by participants but accept no messages.
        resolved.push({
          id: principal.memberId,
          kind: "member",
          allow: access.closed ? readOnly : overwrite.allow,
          deny: access.closed
            ? P.SendMessages | P.SendMessagesInThreads
            : overwrite.deny,
        });
        continue;
      }
      const id =
        principal === "everyone"
          ? this.config.guildId
          : principal === "kush-bot"
            ? this.config.botRoleId()
            : configuredRoleId(this.config.roleIds, principal as RoleKey);
      if (!id) {
        this.log.warn("ticket.overwrite.unresolved", { principal });
        continue;
      }
      resolved.push({
        id,
        kind: "role",
        allow: overwrite.allow,
        deny: overwrite.deny,
      });
    }
    return resolved;
  }

  /** Creates (or reuses) the private channel for a newly created ticket. */
  async open(input: {
    ticket: Ticket;
    queue: TicketQueue;
    creatorId: string;
    existingChannelId: string | null;
  }): Promise<string> {
    const { ticket, queue, creatorId } = input;
    if (
      input.existingChannelId &&
      (await this.discord.channelExists(input.existingChannelId))
    ) {
      this.channels.set(input.existingChannelId, {
        ticketId: ticket.id,
        queue,
      });
      return input.existingChannelId;
    }
    const parentId =
      this.config.channelIds[queue === "reports" ? "reports" : "tickets"] ??
      null;
    if (!parentId) this.log.warn("ticket.parent.missing", { queue });
    const label = ticketCategory(ticket.category)?.label ?? ticket.category;
    const channelId = await this.discord.createChannel({
      name: ticketChannelName(queue, ticket.number),
      parentId,
      topic: `Private ${queue === "reports" ? "report" : "ticket"} #${ticket.number} · ${label}`,
      overwrites: this.overwritesFor({
        queue,
        creatorId,
        assigneeIds: [],
        closed: false,
      }),
    });
    await this.api.setTicketChannel(
      { discordUserId: creatorId },
      ticket.id,
      channelId,
      queue,
    );
    this.channels.set(channelId, { ticketId: ticket.id, queue });
    await this.discord.send(channelId, {
      content: [
        `<@${creatorId}> your ${queue === "reports" ? "report" : "ticket"} **#${ticket.number}** (${label}) is open. Only you and authorised ${queue === "reports" ? "moderators" : "support staff"} can see this channel.`,
        "Reply here and staff will respond. Type `!close <reason>` when you are done.",
      ].join("\n"),
      mentionUserIds: [creatorId],
    });
    await this.notify(queue, ticket, label);
    return channelId;
  }

  /** Summary only, never the description. Reports go to moderators, not support. */
  private async notify(queue: TicketQueue, ticket: Ticket, label: string) {
    const target =
      queue === "reports"
        ? (this.config.channelIds["staff:moderation-log"] ??
          this.config.channelIds["08-staff-operations:moderation-log"])
        : (this.config.channelIds["staff:ticket-queue"] ??
          this.config.channelIds["08-staff-operations:ticket-management"]);
    if (!target) return;
    await this.discord
      .send(target, {
        content: `New ${queue === "reports" ? "report" : "ticket"} **#${ticket.number}** · ${label} · priority ${ticket.priority}. Claim with \`!claim ${ticket.number}\`.`,
      })
      .catch((error: unknown) =>
        this.log.warn("ticket.notify.failed", {
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
  }

  /** Applies backend state (assignee, open/closed) to the channel. */
  async sync(access: TicketAccess): Promise<void> {
    // Access is awaited (it is what keeps tickets private).
    await this.discord.setOverwrites(
      access.channelId,
      this.overwritesFor(access),
    );
    // Renames are cosmetic and Discord allows only 2 per 10 minutes per
    // channel, so they never block the command.
    void this.discord
      .rename(
        access.channelId,
        ticketChannelName(access.queue, access.number, access.closed),
      )
      .catch((error: unknown) =>
        this.log.warn("ticket.rename.deferred", {
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
  }

  /**
   * Restart recovery: rebuild the channel map from PostgreSQL and re-apply
   * access. Missing channels are archived and reported, never silently
   * recreated (their history would be lost).
   */
  async recover(): Promise<{ restored: number; missing: number[] }> {
    const records = await this.api.ticketChannels("active");
    const missing: number[] = [];
    let restored = 0;
    for (const record of records) {
      if (!(await this.discord.channelExists(record.channelId))) {
        missing.push(record.number);
        await this.api.setChannelState(record.channelId, "archived");
        continue;
      }
      this.channels.set(record.channelId, {
        ticketId: record.ticketId,
        queue: record.queue,
      });
      await this.sync(accessFromRecord(record));
      restored += 1;
    }
    this.log.info("tickets.recovered", { restored, missing: missing.length });
    return { restored, missing };
  }
}

export const accessFromRecord = (
  record: TicketChannelRecord,
): TicketAccess => ({
  channelId: record.channelId,
  queue: record.queue,
  number: record.number,
  creatorId: record.customerDiscordUserId,
  assigneeIds: record.assigneeDiscordUserId
    ? [record.assigneeDiscordUserId]
    : [],
  closed: record.status === "closed",
});
