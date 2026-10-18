import type { Logger } from "../runtime/logger.js";

/**
 * Delivers the API's notification outbox to Discord. The API decides the
 * content and target of every message; this worker only transports it and
 * reports back. Mentions are always disabled, so mirrored text can never
 * ping @everyone or a role.
 */

export type Delivery =
  | { target: "channel"; channelKey: string; content: string }
  | { target: "ticket_channel"; channelId: string; content: string }
  | { target: "dm"; discordUserId: string; content: string }
  | {
      target: "create_application_channel";
      applicationId: string;
      number: number;
      applicantDiscordId: string;
      content: string;
    }
  | {
      target: "grant_role";
      discordUserId: string;
      roleId: string;
      reason: string;
    }
  | {
      target: "create_ticket_channel";
      ticketId: string;
      number: number;
      category: string;
      priority: string;
      queue: "support" | "reports";
      customerDiscordId: string;
      /** Posted instead when the customer is not in the server. */
      fallback: Delivery;
    }
  | {
      target: "nda_prompt";
      channelId: string | null;
      discordUserId: string;
      agreementId: string;
      title: string;
      version: string;
      body: string;
      websiteUrl: string;
    }
  | { target: "delete_message"; channelKey: string; messageId: string }
  | {
      target: "offboard";
      discordUserId: string;
      reason: string;
      byDiscordUserId: string | null;
      ticketsUnassigned: number;
      commissionsUnassigned: number;
    }
  | { target: "none"; reason: string };

export interface NotificationJob {
  id: string;
  kind: string;
  delivery: Delivery;
}

export interface NotificationApi {
  notificationJobs(): Promise<NotificationJob[]>;
  finishNotificationJob(
    jobId: string,
    outcome: { ok: true } | { ok: false; error: string },
  ): Promise<void>;
}

/** "undeliverable" = permanent (DMs closed, channel gone): do not retry. */
export type SendResult = "sent" | "undeliverable";

export interface NotificationGateway {
  sendToChannel(channelId: string, content: string): Promise<SendResult>;
  sendDm(discordUserId: string, content: string): Promise<SendResult>;
  createApplicationChannel(input: {
    applicationId: string;
    number: number;
    applicantDiscordId: string;
    content: string;
  }): Promise<SendResult>;
  grantRole(
    discordUserId: string,
    roleId: string,
    reason: string,
  ): Promise<SendResult>;
  sendNdaPrompt(
    delivery: Extract<Delivery, { target: "nda_prompt" }>,
  ): Promise<SendResult>;
  deleteMessage(channelId: string, messageId: string): Promise<SendResult>;
  /** Website-initiated offboarding: remove staff roles, DM, log. */
  offboard(
    delivery: Extract<Delivery, { target: "offboard" }>,
  ): Promise<SendResult>;
  /** "absent": the customer is not a member, so post the fallback. */
  createTicketChannel(
    delivery: Extract<Delivery, { target: "create_ticket_channel" }>,
  ): Promise<SendResult | "absent">;
}

export interface NotificationStats {
  delivered: number;
  undeliverable: number;
  failed: number;
  lastRunAt: string | null;
  lastError: string | null;
}

export class NotificationWorker {
  readonly stats: NotificationStats = {
    delivered: 0,
    undeliverable: 0,
    failed: 0,
    lastRunAt: null,
    lastError: null,
  };
  #running = false;

  constructor(
    private readonly api: NotificationApi,
    private readonly gateway: NotificationGateway,
    /** Configured channel IDs by blueprint key, e.g. "staff:ticket-queue". */
    private readonly channelIds: () => Record<string, string>,
    private readonly log: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Processes due jobs once. Overlapping calls are skipped, not queued. */
  async tick(): Promise<number> {
    if (this.#running) return 0;
    this.#running = true;
    try {
      const jobs = await this.api.notificationJobs();
      for (const job of jobs) await this.#deliver(job);
      this.stats.lastRunAt = this.now().toISOString();
      return jobs.length;
    } finally {
      this.#running = false;
    }
  }

  async #send(delivery: Delivery): Promise<SendResult | "skipped"> {
    switch (delivery.target) {
      case "none":
        return "skipped";
      case "dm":
        return this.gateway.sendDm(delivery.discordUserId, delivery.content);
      case "nda_prompt":
        return this.gateway.sendNdaPrompt(delivery);
      case "create_ticket_channel": {
        const result = await this.gateway.createTicketChannel(delivery);
        return result === "absent" ? this.#send(delivery.fallback) : result;
      }
      case "create_application_channel":
        return this.gateway.createApplicationChannel(delivery);
      case "grant_role":
        return this.gateway.grantRole(
          delivery.discordUserId,
          delivery.roleId,
          delivery.reason,
        );
      case "delete_message": {
        const channelId = this.channelIds()[delivery.channelKey];
        if (!channelId) return "undeliverable";
        return this.gateway.deleteMessage(channelId, delivery.messageId);
      }
      case "offboard":
        return this.gateway.offboard(delivery);
      case "ticket_channel":
        return this.gateway.sendToChannel(delivery.channelId, delivery.content);
      case "channel": {
        const channelId = this.channelIds()[delivery.channelKey];
        // A missing channel is a configuration problem, not a transient one.
        if (!channelId)
          throw new Error(`No channel configured for ${delivery.channelKey}`);
        return this.gateway.sendToChannel(channelId, delivery.content);
      }
    }
  }

  async #deliver(job: NotificationJob) {
    try {
      const result = await this.#send(job.delivery);
      if (result === "sent") this.stats.delivered += 1;
      if (result === "undeliverable") {
        this.stats.undeliverable += 1;
        this.log.info("notification.undeliverable", {
          jobId: job.id,
          kind: job.kind,
          target: job.delivery.target,
        });
      }
      await this.api.finishNotificationJob(job.id, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      this.stats.failed += 1;
      this.stats.lastError = message.slice(0, 200);
      this.log.warn("notification.failed", {
        jobId: job.id,
        kind: job.kind,
        error: message,
      });
      await this.api
        .finishNotificationJob(job.id, { ok: false, error: message })
        .catch(() => undefined);
    }
  }
}

/** Discord API error codes that will never succeed on retry. */
export const PERMANENT_DISCORD_ERRORS = new Set([
  10003, // Unknown channel
  10007, // Unknown member (left the server)
  10013, // Unknown user
  50001, // Missing access
  50007, // Cannot send messages to this user (DMs closed)
]);
