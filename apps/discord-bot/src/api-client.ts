import { createHash } from "node:crypto";

/** Non-2xx API response; `message` comes from the API and is safe to show. */
export interface Vouch {
  number: number;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
}

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
  /** People staff added with /ticket add (older APIs omit it). */
  participantDiscordUserIds?: string[];
}

export interface DesiredRoles {
  member: boolean;
  verifiedCustomer: boolean;
  productRoleIds: string[];
  managedProductRoleIds: string[];
  linked: boolean;
  /** Allowlisted role keys staff granted (older APIs omit these). */
  grantedRoleKeys?: string[];
  /** Keys staff revoked: removed only if the member still holds them. */
  revokedRoleKeys?: string[];
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

// ---------------------------------------------------------------- commerce

export interface PublicProduct {
  slug: string;
  name: string;
  description: string;
  category: string | null;
  imageUrl: string | null;
  pricePence: number;
  currency: string;
}

export interface CatalogueService {
  slug: string;
  name: string;
  summary: string;
  category: string;
  startingPrice: string | null;
  offers: {
    name: string;
    kind: string;
    priceLabel: string;
  }[];
}

export interface Order {
  id: string;
  number: number;
  kind: string;
  description: string;
  status: string;
  currency: string;
  subtotalPence: number;
  creditAppliedPence: number;
  totalPence: number;
  refundedPence: number;
  paidAt: string | null;
  createdAt: string;
  payments?: {
    provider: string;
    amountPence: number;
    receiptUrl: string | null;
  }[];
}

export interface CreditEntry {
  amountPence: number;
  kind: string;
  reference: string | null;
  balanceAfterPence: number;
  createdAt: string;
}

export interface ReferralSummary {
  code: string;
  qualified: number;
  pending: number;
  underReview: number;
  disqualified: number;
  linked: boolean;
  rewards: {
    milestone: number;
    type: string;
    valuePence: number | null;
    status: string;
    issuedAt: string | null;
  }[];
  milestones: { count: number; label: string }[];
  next: { count: number; label: string; remaining: number } | null;
  rules: { minAccountAgeDays: number; minMembershipDays: number };
}

export interface CommissionSummary {
  id: string;
  title: string;
  category: string;
  status: string;
  ticketNumber: number | null;
  updatedAt: string;
  quote?: string | null;
  customerName?: string;
  assigneeName?: string | null;
}

export interface CommissionDetail {
  commission: CommissionSummary & {
    details: string;
    approximateBudget: string | null;
    preferredTimeframe: string | null;
    customerDiscordId: string | null;
    actions: { statuses: string[]; note: boolean; assign: boolean };
  };
  quotes: {
    amount: string;
    status: string;
    summary: string;
    timeframe: string | null;
  }[];
  milestones: { title: string; status: string }[];
}

export interface CommissionInput {
  discordUserId: string;
  requestId: string;
  category: string;
  serviceTier: "starter" | "standard" | "premium" | null;
  title: string;
  details: string;
  approximateBudget: string | null;
  preferredTimeframe: string | null;
  referenceLinks: string | null;
  contactPreference: string | null;
}

export interface BusinessStats {
  customers: number;
  orders: number;
  revenuePence: number;
  creditSpentPence: number;
  refundsPence: number;
  openQuotes: number;
  activeCommissions: number;
  completedCommissions: number;
  openTickets: number;
  qualifiedReferrals: number;
  flaggedReferrals: number;
}

/** Where a staff commission command points: this channel or a ticket number. */
export interface CommissionTarget {
  channelId?: string;
  ticket?: number;
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

  // ------------------------------------------------ vouches, offboarding

  async vouch(input: {
    discordUserId: string;
    authorName: string;
    rating: number;
    body: string;
  }) {
    return this.#request<Vouch>("POST", `${this.#tenant}/vouches`, input);
  }

  async setVouchMessage(number: number, messageId: string) {
    await this.#request("POST", `${this.#tenant}/vouches/${number}/message`, {
      messageId,
    });
  }

  async hideVouch(number: number, byDiscordUserId: string) {
    return this.#request<{ hidden: boolean; messageId: string | null }>(
      "POST",
      `${this.#tenant}/vouches/${number}/hide`,
      { byDiscordUserId },
    );
  }

  async offboard(
    discordUserId: string,
    reason: string,
    byDiscordUserId: string,
  ) {
    return this.#request<{
      recorded: boolean;
      ticketsUnassigned: number;
      commissionsUnassigned: number;
    }>("POST", `${this.#tenant}/staff/${discordUserId}/offboard`, {
      reason,
      byDiscordUserId,
    });
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

  // ------------------------------------------------------------ commerce

  async products() {
    return (
      await this.#request<{ products: PublicProduct[] }>(
        "GET",
        "/public/products",
      )
    ).products;
  }

  async catalogue() {
    return (
      await this.#request<{ services: CatalogueService[] }>(
        "GET",
        "/public/catalogue",
      )
    ).services;
  }

  /** Starts (or, for the same interaction, resumes) a Stripe Checkout. */
  async checkout(input: {
    discordUserId: string;
    productSlug: string;
    interactionId: string;
    useCredit: boolean;
  }) {
    return this.#request<{
      orderNumber: number;
      status: string;
      checkoutUrl: string | null;
      totalPence: number;
      creditAppliedPence: number;
    }>("POST", `${this.#tenant}/checkout`, input);
  }

  async orders(discordUserId: string) {
    return (
      await this.#request<{ orders: Order[] }>(
        "GET",
        `${this.#tenant}/orders?${new URLSearchParams({ discordUserId })}`,
      )
    ).orders;
  }

  async order(discordUserId: string, number: number) {
    return (
      await this.#request<{ order: Order }>(
        "GET",
        `${this.#tenant}/orders/${number}?${new URLSearchParams({ discordUserId })}`,
      )
    ).order;
  }

  async credit(discordUserId: string) {
    return this.#request<{
      balancePence: number;
      history: CreditEntry[];
      /** False until the owner switches credit spending on. */
      spendable?: boolean;
    }>(
      "GET",
      `${this.#tenant}/credit?${new URLSearchParams({ discordUserId })}`,
    );
  }

  async createProduct(actorDiscordId: string, product: object) {
    return (
      await this.#request<{ product: PublicProduct & { status: string } }>(
        "POST",
        `${this.#tenant}/products`,
        { actorDiscordId, product },
      )
    ).product;
  }

  async updateProduct(actorDiscordId: string, slug: string, product: object) {
    return (
      await this.#request<{ product: PublicProduct & { status: string } }>(
        "POST",
        `${this.#tenant}/products/${slug}`,
        { actorDiscordId, product },
      )
    ).product;
  }

  // ----------------------------------------------------------- referrals

  async referralJoin(input: {
    invitedDiscordId: string;
    accountCreatedAt: string;
    joinedAt: string;
    inviter: {
      discordUserId: string;
      inviteCode: string | null;
      confidence: "exact" | "probable";
    } | null;
  }) {
    return this.#request<{ recorded: boolean; status?: string }>(
      "POST",
      `${this.#tenant}/referrals/joins`,
      input,
    );
  }

  async referralLeave(discordUserId: string) {
    await this.#request("POST", `${this.#tenant}/referrals/leaves`, {
      discordUserId,
    });
  }

  async referralClaim(input: {
    invitedDiscordId: string;
    code: string;
    accountCreatedAt: string;
    joinedAt: string;
  }) {
    return this.#request<{ inviterDiscordId: string; status: string }>(
      "POST",
      `${this.#tenant}/referrals/claim`,
      input,
    );
  }

  async referralSummary(discordUserId: string) {
    return this.#request<ReferralSummary>(
      "GET",
      `${this.#tenant}/referrals/me?${new URLSearchParams({ discordUserId })}`,
    );
  }

  async referralLeaderboard() {
    return (
      await this.#request<{
        leaders: { discordUserId: string; qualified: number }[];
      }>("GET", `${this.#tenant}/referrals/leaderboard`)
    ).leaders;
  }

  /** Qualifies waiting referrals and issues milestone rewards (idempotent). */
  async referralRun() {
    return this.#request<{ qualified: number; issued: number }>(
      "POST",
      `${this.#tenant}/referrals/run`,
    );
  }

  // --------------------------------------------------------- commissions

  async createCommission(input: CommissionInput) {
    return this.#request<{
      id: string;
      title: string;
      status: string;
      ticketNumber: number | null;
    }>("POST", `${this.#tenant}/commissions`, input);
  }

  async myCommissions(discordUserId: string) {
    return (
      await this.#request<{ commissions: CommissionSummary[] }>(
        "GET",
        `${this.#tenant}/commissions/mine?${new URLSearchParams({ discordUserId })}`,
      )
    ).commissions;
  }

  // --------------------------------------------- staff (API checks roles)

  async staffOrders(actorDiscordId: string) {
    return (
      await this.#request<{ orders: Order[] }>(
        "GET",
        `${this.#tenant}/staff/orders?${new URLSearchParams({ actorDiscordId })}`,
      )
    ).orders;
  }

  async staffCommissions(actorDiscordId: string, scope: "assigned" | "all") {
    return (
      await this.#request<{ commissions: CommissionSummary[] }>(
        "GET",
        `${this.#tenant}/staff/commissions?${new URLSearchParams({ actorDiscordId, scope })}`,
      )
    ).commissions;
  }

  async findCommission(actorDiscordId: string, target: CommissionTarget) {
    const query = new URLSearchParams({ actorDiscordId });
    if (target.ticket) query.set("ticket", String(target.ticket));
    else if (target.channelId) query.set("channelId", target.channelId);
    return this.#request<CommissionDetail>(
      "GET",
      `${this.#tenant}/staff/commissions/find?${query}`,
    );
  }

  async commissionStatus(
    actorDiscordId: string,
    target: CommissionTarget,
    status: string,
  ) {
    return this.#request<{ ticketNumber: number; status: string }>(
      "POST",
      `${this.#tenant}/staff/commissions/status`,
      { actorDiscordId, ...target, status },
    );
  }

  async commissionAssign(
    actorDiscordId: string,
    target: CommissionTarget,
    assigneeDiscordId: string | null,
  ) {
    return this.#request<{ ticketNumber: number; assigned: boolean }>(
      "POST",
      `${this.#tenant}/staff/commissions/assign`,
      { actorDiscordId, ...target, assigneeDiscordId },
    );
  }

  async commissionQuote(
    actorDiscordId: string,
    target: CommissionTarget,
    quote: {
      amountPence: number;
      summary: string;
      timeframe: string | null;
      revisions: number | null;
    },
  ) {
    return this.#request<{ ticketNumber: number; amount: string }>(
      "POST",
      `${this.#tenant}/staff/commissions/quote`,
      { actorDiscordId, ...target, ...quote },
    );
  }

  async staffCustomer(actorDiscordId: string, discordUserId: string) {
    return (
      await this.#request<{
        customer: {
          name: string;
          since: string;
          paidOrders: number;
          activeCommissions: number;
          openTickets: number;
          qualifiedReferrals: number;
          creditPence: number;
        };
      }>(
        "GET",
        `${this.#tenant}/staff/customers/${discordUserId}?${new URLSearchParams({ actorDiscordId })}`,
      )
    ).customer;
  }

  async staffStats(actorDiscordId: string) {
    return (
      await this.#request<{ stats: BusinessStats }>(
        "GET",
        `${this.#tenant}/staff/stats?${new URLSearchParams({ actorDiscordId })}`,
      )
    ).stats;
  }

  /** Grants or revokes an allowlisted role (the API checks the actor). */
  async setStaffRole(input: {
    actorDiscordId: string;
    discordUserId: string;
    roleKey: string;
    action: "grant" | "revoke";
    reason: string;
    requestId: string;
  }) {
    return this.#request<{
      roleKey: string;
      state: string;
      duplicate: boolean;
    }>("POST", `${this.#tenant}/staff/roles`, input);
  }

  /** Adds someone to the ticket in this channel (the API checks the actor). */
  async addTicketParticipant(
    actor: DiscordActor,
    channelId: string,
    discordUserId: string,
  ) {
    return this.#request<{ ticket: Ticket; added: boolean }>(
      "POST",
      `${this.#tenant}/tickets/by-channel/${channelId}/participants`,
      { discordUserId },
      actor,
    );
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
