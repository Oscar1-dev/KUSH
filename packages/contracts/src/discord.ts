import { z } from "zod";

const snowflake = z.string().regex(/^[0-9]{17,20}$/);

export const ticketQueues = ["support", "reports"] as const;
export type TicketQueue = (typeof ticketQueues)[number];

export const ticketChannelInputSchema = z
  .object({ channelId: snowflake, queue: z.enum(ticketQueues) })
  .strict();

export const ticketChannelStateSchema = z
  .object({ state: z.enum(["active", "archived"]) })
  .strict();

export const discordAssignSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    assigneeDiscordUserId: snowflake.nullable(),
  })
  .strict();

/** Service-level view used by the bot for restart recovery. No content. */
export interface DiscordTicketChannel {
  ticketId: string;
  number: number;
  status: string;
  category: string;
  priority: string;
  channelId: string;
  queue: TicketQueue;
  state: "active" | "archived";
  customerDiscordUserId: string | null;
  assigneeDiscordUserId: string | null;
}

/** Queue summary for claiming. Deliberately excludes the description. */
export interface TicketQueueItem {
  ticketId: string;
  number: number;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  channelId: string | null;
}
