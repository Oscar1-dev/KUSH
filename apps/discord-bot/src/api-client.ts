import { createHash } from "node:crypto";

/** Non-2xx API response; `message` comes from the API and is safe to show. */
export type CaseKind =
  "warn" | "timeout" | "untimeout" | "kick" | "ban" | "unban" | "note";

export interface CaseInput {
  kind: CaseKind;
  targetId: string;
  moderatorId: string | null;
  reason: string;
  durationSeconds?: number;
  source: "bot" | "discord";
}

export interface ModerationCase extends Omit<CaseInput, "durationSeconds"> {
  number: number;
  durationSeconds: number | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DiscordApiClientOptions {
  baseUrl: string;
  tenantId: string;
  guildId: string;
  integrationSecret: string;
  fetch?: typeof fetch;
}

/** Deterministic UUID from a Discord snowflake, so retries are idempotent. */
export function requestUuid(interactionId: string): string {
  const bytes = createHash("sha256")
    .update(`kush-discord:${interactionId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type TicketQueue = "support" | "reports";

export interface Ticket {
  id: string;
  number: number;
  category: string;
  status: string;
  priority: string;
  assignedUserId: string | null;
  customerId: string;
  version: number;
  description: string;
  closureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail {
  ticket: Ticket;
  messages: {
    id: string;
    authorId: string;
    kind: "reply" | "note";
    content: string;
    createdAt: string;
  }[];
  events: { id: string; actorId: string; action: string; createdAt: string }[];
}

export interface QueueItem {
  ticketId: string;
  number: number;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  channelId: string | null;
}

export interface TicketChannelRecord {
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

export interface DesiredRoles {
  member: boolean;
  verifiedCustomer: boolean;
  productRoleIds: string[];
  managedProductRoleIds: string[];
  linked: boolean;
}

export type { NotificationJob } from "./automation/notifications.js";
import type { NotificationJob } from "./automation/notifications.js";

export interface RoleSyncJob {
  id: string;
  discordUserId: string;
  reason: string;
  attempts: number;
  /** Bumped when a newer request is coalesced in; echoed back on completion. */
  generation: number;
}

/** The Discord member on whose behalf a call is made. */
export interface DiscordActor {
  discordUserId: string;
  guildId?: string;
}

export class DiscordApiClient {
  readonly #fetch: typeof fetch;

  constructor(private readonly options: DiscordApiClientOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  get #tenant() {
    return `/discord/integration/tenants/${this.options.tenantId}`;
  }

  async #request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    body?: unknown,
    actor?: DiscordActor,
  ): Promise<T> {
    const response = await this.#fetch(new URL(path, this.options.baseUrl), {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        "x-kush-discord-secret": this.options.integrationSecret,
        "x-kush-discord-guild-id": actor?.guildId ?? this.options.guildId,
        ...(actor ? { "x-kush-discord-user-id": actor.discordUserId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      throw new ApiError(
        response.status,
        typeof error?.error === "string"
          ? error.error
          : `KUSH API request failed (${response.status})`,
      );
    }
    return (await response.json()) as T;
  }

  // ------------------------------------------------------------ linking

  async complete(input: {
    code: string;
    discordUserId: string;
    guildId: string;
  }): Promise<void> {
    await this.#request("POST", `${this.#tenant}/links/complete`, input);
  }

  // ------------------------------------------------------------ tickets

  /** Works for members without a KUSH account (a Discord identity is created). */
  async create(input: {
    discordUserId: string;
    guildId: string;
    interactionId: string;
    category: string;
    description: string;
  }): Promise<{
    reference: string;
    ticket: Ticket;
    queue: TicketQueue;
    channel: { channel_id: string; queue: TicketQueue } | null;
  }> {
    const result = await this.#request<{
      ticket: Ticket;
      queue: TicketQueue;
      channel: { channel_id: string; queue: TicketQueue } | null;
    }>(
      "POST",
      `${this.#tenant}/tickets`,
      {
        requestId: requestUuid(input.interactionId),
        category: input.category,
        description: input.description,
      },
      input,
    );
    return { reference: `#${result.ticket.number}`, ...result };
  }

  async setTicketChannel(
    actor: DiscordActor,
    ticketId: string,
    channelId: string,
    queue: TicketQueue,
  ) {
    return this.#request<{ channelId: string }>(
      "PUT",
      `${this.#tenant}/tickets/${ticketId}/channel`,
      { channelId, queue },
      actor,
    );
  }

  async ticketByChannel(actor: DiscordActor, channelId: string) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "GET",
        `${this.#tenant}/tickets/by-channel/${channelId}`,
        undefined,
        actor,
      )
    ).ticket;
  }

  async ticketByNumber(actor: DiscordActor, number: number) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "GET",
        `${this.#tenant}/tickets/by-number/${number}`,
        undefined,
        actor,
      )
    ).ticket;
  }

  async listTickets(actor: DiscordActor) {
    return (
      await this.#request<{ tickets: Ticket[] }>(
        "GET",
        `${this.#tenant}/tickets`,
        undefined,
        actor,
      )
    ).tickets;
  }

  async queue(actor: DiscordActor) {
    return (
      await this.#request<{ queue: QueueItem[] }>(
        "GET",
        `${this.#tenant}/queue`,
        undefined,
        actor,
      )
    ).queue;
  }

  async transcript(actor: DiscordActor, ticketId: string) {
    return this.#request<TicketDetail & { exportedAt: string }>(
      "GET",
      `${this.#tenant}/tickets/${ticketId}/transcript`,
      undefined,
      actor,
    );
  }

  async claim(actor: DiscordActor, ticketId: string) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "POST",
        `${this.#tenant}/tickets/${ticketId}/claim`,
        undefined,
        actor,
      )
    ).ticket;
  }

  /** Claim by number or by ticket channel (unassigned staff cannot read it first). */
  async claimBy(
    actor: DiscordActor,
    target: { number: number } | { channelId: string },
  ) {
    const path =
      "number" in target
        ? `${this.#tenant}/tickets/by-number/${target.number}/claim`
        : `${this.#tenant}/tickets/by-channel/${target.channelId}/claim`;
    return (
      await this.#request<{ ticket: Ticket }>("POST", path, undefined, actor)
    ).ticket;
  }

  async assign(
    actor: DiscordActor,
    ticketId: string,
    expectedVersion: number,
    assigneeDiscordUserId: string | null,
  ) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "POST",
        `${this.#tenant}/tickets/${ticketId}/assign`,
        { expectedVersion, assigneeDiscordUserId },
        actor,
      )
    ).ticket;
  }

  async patch(
    actor: DiscordActor,
    ticketId: string,
    input: { expectedVersion: number; priority?: string; status?: string },
  ) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "PATCH",
        `${this.#tenant}/tickets/${ticketId}`,
        input,
        actor,
      )
    ).ticket;
  }

  async message(
    actor: DiscordActor,
    ticketId: string,
    input: {
      requestId: string;
      expectedVersion: number;
      kind: "reply" | "note";
      content: string;
    },
  ) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "POST",
        `${this.#tenant}/tickets/${ticketId}/messages`,
        input,
        actor,
      )
    ).ticket;
  }

  async close(
    actor: DiscordActor,
    ticketId: string,
    expectedVersion: number,
    reason: string,
  ) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "POST",
        `${this.#tenant}/tickets/${ticketId}/close`,
        { expectedVersion, confirm: true, reason },
        actor,
      )
    ).ticket;
  }

  async reopen(actor: DiscordActor, ticketId: string, expectedVersion: number) {
    return (
      await this.#request<{ ticket: Ticket }>(
        "POST",
        `${this.#tenant}/tickets/${ticketId}/reopen`,
        { expectedVersion },
        actor,
      )
    ).ticket;
  }

  /** Service-level (no actor): identifiers and state for restart recovery. */
  async ticketChannels(state: "active" | "archived" = "active") {
    return (
      await this.#request<{ channels: TicketChannelRecord[] }>(
        "GET",
        `${this.#tenant}/ticket-channels?state=${state}`,
      )
    ).channels;
  }

  async setChannelState(channelId: string, state: "active" | "archived") {
    await this.#request(
      "PATCH",
      `${this.#tenant}/ticket-channels/${channelId}`,
      { state },
    );
  }

  // --------------------------------------------------- moderation cases

  async recordCase(input: CaseInput) {
    return this.#request<ModerationCase>(
      "POST",
      `${this.#tenant}/moderation/cases`,
      input,
    );
  }

  async listCases(targetId?: string, limit = 10) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (targetId) query.set("target", targetId);
    return (
      await this.#request<{ cases: ModerationCase[] }>(
        "GET",
        `${this.#tenant}/moderation/cases?${query}`,
      )
    ).cases;
  }

  async getCase(number: number) {
    return this.#request<ModerationCase>(
      "GET",
      `${this.#tenant}/moderation/cases/${number}`,
    );
  }

  // ------------------------------------------------- membership and roles

  async acceptRules(discordUserId: string, version: string) {
    await this.#request(
      "POST",
      `${this.#tenant}/members/${discordUserId}/rules`,
      { version },
    );
  }

  async presence(discordUserId: string, present: boolean) {
    await this.#request(
      "POST",
      `${this.#tenant}/members/${discordUserId}/presence`,
      { present },
    );
  }

  async desiredRoles(discordUserId: string) {
    return this.#request<DesiredRoles>(
      "GET",
      `${this.#tenant}/members/${discordUserId}/roles`,
    );
  }

  async memberEntitlements(discordUserId: string) {
    return this.#request<{
      linked: boolean;
      entitlements: {
        productName: string;
        status: string;
        expiresAt: string | null;
      }[];
    }>("GET", `${this.#tenant}/members/${discordUserId}/entitlements`);
  }

  async roleSyncJobs() {
    return (
      await this.#request<{ jobs: RoleSyncJob[] }>(
        "GET",
        `${this.#tenant}/role-sync/jobs`,
      )
    ).jobs;
  }

  async finishRoleSyncJob(
    job: Pick<RoleSyncJob, "id" | "generation">,
    outcome: { ok: true } | { ok: false; error: string },
  ) {
    await this.#request("POST", `${this.#tenant}/role-sync/jobs/${job.id}`, {
      ...outcome,
      generation: job.generation,
    });
  }

  async notificationJobs() {
    return (
      await this.#request<{ jobs: NotificationJob[] }>(
        "GET",
        `${this.#tenant}/notifications/jobs`,
      )
    ).jobs;
  }

  async finishNotificationJob(
    jobId: string,
    outcome: { ok: true } | { ok: false; error: string },
  ) {
    await this.#request(
      "POST",
      `${this.#tenant}/notifications/jobs/${jobId}`,
      outcome,
    );
  }

  async applicationChannels() {
    return (
      await this.#request<{
        channels: {
          applicationId: string;
          channelId: string;
          status: string;
        }[];
      }>("GET", `${this.#tenant}/application-channels`)
    ).channels;
  }

  async recordApplicationChannel(applicationId: string, channelId: string) {
    await this.#request(
      "POST",
      `${this.#tenant}/applications/${applicationId}/channel`,
      { channelId },
    );
  }

  async applicationMessage(
    channelId: string,
    input: { discordUserId: string; messageId: string; content: string },
  ) {
    await this.#request(
      "POST",
      `${this.#tenant}/application-channels/${channelId}/messages`,
      input,
    );
  }

  async signAgreement(
    agreementId: string,
    input: {
      discordUserId: string;
      legalName: string;
      email: string;
      signature: string;
      confirmation: string;
    },
  ) {
    return this.#request<{ signed: boolean }>(
      "POST",
      `${this.#tenant}/agreements/${agreementId}/sign`,
      input,
    );
  }

  async reconcileRoles() {
    return (
      await this.#request<{ queued: number }>(
        "POST",
        `${this.#tenant}/role-sync/reconcile`,
      )
    ).queued;
  }

  // ----------------------------------------------------- partner programme

  /** Partner programme application, stored as a commercial request of kind "partner". */
  async submitApplication(input: {
    discordUserId: string;
    guildId: string;
    interactionId: string;
    programme: "seller" | "reseller";
    title: string;
    details: string;
    url: string | null;
  }): Promise<{ id: string; status: string }> {
    const result = await this.#request<{
      request: { id: string; status: string };
    }>(
      "POST",
      `${this.#tenant}/commercial-requests`,
      {
        requestId: requestUuid(input.interactionId),
        kind: "partner",
        category: `${input.programme}-application`,
        title: input.title,
        details: input.details,
        productUrl: input.url,
      },
      input,
    );
    return result.request;
  }

  /** Unauthenticated liveness probe of the KUSH API. */
  async health(): Promise<boolean> {
    const response = await this.#fetch(
      new URL("/health", this.options.baseUrl),
      { signal: AbortSignal.timeout(5_000) },
    );
    return response.ok;
  }
}
