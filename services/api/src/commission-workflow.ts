import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "@kush/database";
import type { User } from "@kush/contracts";
import { enqueueNotification } from "./notifications.js";
import { can, type StaffContext } from "./staff-access.js";
import { SupportError, SupportService } from "./support-service.js";

/**
 * Commission conversation, quotes and milestones.
 * - Every website commission gets a linked support ticket: the same
 *   conversation is available on the website, to staff and in Discord.
 * - Quotes are written proposals. Accepting one moves the commission to
 *   "accepted"; nothing is charged.
 * - Milestones show the customer how delivery is going.
 */

const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const notFound = () => fail(404, "Not found");

/** Deterministic UUID from a seed (stable idempotency key per commission). */
const seededUuid = (seed: string) => {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export class CommissionWorkflow {
  private readonly support: SupportService;
  constructor(private readonly pool: Pool) {
    this.support = new SupportService(pool);
  }

  private async tx<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        (error as { code?: string }).code === "23505" &&
        !(error instanceof SupportError)
      )
        fail(409, "There is already an open quote for this commission");
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(
    c: Pick<PoolClient, "query">,
    actor: string,
    action: string,
    tenantId: string,
  ) {
    return c.query(
      "INSERT INTO audit_events(actor_id,action,tenant_id) VALUES($1,$2,$3)",
      [actor, action, tenantId],
    );
  }

  /** Opens (once) the support ticket that carries the conversation. */
  async linkTicket(
    user: User,
    tenantId: string,
    commission: { id: string; title: string; details: string },
  ) {
    const existing = (
      await this.pool.query<{ ticket_id: string | null }>(
        "SELECT ticket_id FROM commercial_requests WHERE tenant_id=$1 AND id=$2",
        [tenantId, commission.id],
      )
    ).rows[0];
    if (existing?.ticket_id) return existing.ticket_id;
    const categories =
      (
        await this.pool.query<{ config: { categories: { key: string }[] } }>(
          "SELECT config FROM support_tenants WHERE id=$1",
          [tenantId],
        )
      ).rows[0]?.config.categories.map((c) => c.key) ?? [];
    const category = categories.includes("commission")
      ? "commission"
      : categories[0];
    if (!category) return null;
    const ticket = await this.support.createTicket(user, tenantId, {
      requestId: seededUuid(`commission-ticket:${commission.id}`),
      category,
      description:
        `Commission enquiry: ${commission.title}\n\n${commission.details}`.slice(
          0,
          10_000,
        ),
    });
    await this.pool.query(
      "UPDATE commercial_requests SET ticket_id=$3 WHERE tenant_id=$1 AND id=$2 AND ticket_id IS NULL",
      [tenantId, commission.id, ticket.id],
    );
    // Same as a website ticket: the bot opens its private Discord channel,
    // so the commission conversation is live in Discord from the start.
    await enqueueNotification(
      this.pool,
      tenantId,
      "ticket.created",
      ticket.id,
      {},
      `ticket.created:${ticket.id}`,
    );
    return ticket.id;
  }

  /** Quotes and milestones for a commission (customer or staff view). */
  async extras(tenantId: string, requestId: string) {
    const [quotes, milestones, ticket] = await Promise.all([
      this.pool.query(
        `SELECT id,amount,summary,timeframe,status,created_at AS "createdAt",decided_at AS "decidedAt",decline_reason AS "declineReason"
         FROM commission_quotes WHERE tenant_id=$1 AND request_id=$2 ORDER BY created_at DESC`,
        [tenantId, requestId],
      ),
      this.pool.query(
        `SELECT id,title,status,position,updated_at AS "updatedAt" FROM commission_milestones
         WHERE tenant_id=$1 AND request_id=$2 ORDER BY position,created_at`,
        [tenantId, requestId],
      ),
      this.pool.query<{ ticket_id: string | null }>(
        "SELECT ticket_id FROM commercial_requests WHERE tenant_id=$1 AND id=$2",
        [tenantId, requestId],
      ),
    ]);
    return {
      quotes: quotes.rows,
      milestones: milestones.rows,
      ticketId: ticket.rows[0]?.ticket_id ?? null,
    };
  }

  private async lockCommission(
    c: PoolClient,
    tenantId: string,
    requestId: string,
  ) {
    const row = (
      await c.query<{
        status: string;
        requester_id: string;
        assigned_user_id: string | null;
        title: string;
      }>(
        "SELECT status,requester_id,assigned_user_id,title FROM commercial_requests WHERE tenant_id=$1 AND id=$2 AND kind='commission' FOR UPDATE",
        [tenantId, requestId],
      )
    ).rows[0];
    return row ?? notFound();
  }

  private bump(
    c: PoolClient,
    tenantId: string,
    requestId: string,
    status: string,
  ) {
    return c.query(
      "UPDATE commercial_requests SET status=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
      [tenantId, requestId, status],
    );
  }

  // ------------------------------------------------------------------ staff

  async propose(
    staff: StaffContext,
    requestId: string,
    input: { amount: string; summary: string; timeframe: string | null },
  ) {
    if (!can(staff, "commissions.manage"))
      fail(403, "Your staff role does not allow this");
    return this.tx(async (c) => {
      const row = await this.lockCommission(c, staff.tenantId, requestId);
      if (!["reviewing", "awaiting_customer"].includes(row.status))
        fail(409, "Quotes can be sent while the commission is under review");
      const quote = (
        await c.query<{ id: string }>(
          "INSERT INTO commission_quotes(tenant_id,request_id,amount,summary,timeframe,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [
            staff.tenantId,
            requestId,
            input.amount,
            input.summary,
            input.timeframe,
            staff.userId,
          ],
        )
      ).rows[0]!;
      await this.bump(c, staff.tenantId, requestId, "quoted");
      await this.audit(
        c,
        staff.userId,
        "staff.commission.quote.proposed",
        staff.tenantId,
      );
      await enqueueNotification(
        c,
        staff.tenantId,
        "commission.status",
        requestId,
        { status: "quoted" },
        `commission.status:${requestId}:quoted:${quote.id}`,
      );
      return { quoteId: quote.id };
    });
  }

  async withdraw(staff: StaffContext, requestId: string, quoteId: string) {
    if (!can(staff, "commissions.manage"))
      fail(403, "Your staff role does not allow this");
    return this.tx(async (c) => {
      const row = await this.lockCommission(c, staff.tenantId, requestId);
      const updated = await c.query(
        "UPDATE commission_quotes SET status='withdrawn',decided_at=now() WHERE tenant_id=$1 AND request_id=$2 AND id=$3 AND status='proposed'",
        [staff.tenantId, requestId, quoteId],
      );
      if (!updated.rowCount) fail(409, "That quote is no longer open");
      if (row.status === "quoted")
        await this.bump(c, staff.tenantId, requestId, "reviewing");
      await this.audit(
        c,
        staff.userId,
        "staff.commission.quote.withdrawn",
        staff.tenantId,
      );
      return { withdrawn: true };
    });
  }

  /** Assigned developer or a commission manager. */
  private mayEditMilestones(
    staff: StaffContext,
    row: { assigned_user_id: string | null },
  ) {
    return (
      can(staff, "commissions.manage") ||
      (can(staff, "commissions.assigned") &&
        row.assigned_user_id === staff.userId)
    );
  }

  async addMilestone(staff: StaffContext, requestId: string, title: string) {
    return this.tx(async (c) => {
      const row = await this.lockCommission(c, staff.tenantId, requestId);
      if (!this.mayEditMilestones(staff, row)) notFound();
      if (["completed", "cancelled"].includes(row.status))
        fail(409, "This commission is closed");
      const next = (
        await c.query<{ n: number }>(
          "SELECT COALESCE(max(position),0)+1 AS n FROM commission_milestones WHERE request_id=$1",
          [requestId],
        )
      ).rows[0]!.n;
      const milestone = (
        await c.query<{ id: string }>(
          "INSERT INTO commission_milestones(tenant_id,request_id,title,position,updated_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [staff.tenantId, requestId, title, next, staff.userId],
        )
      ).rows[0]!;
      await this.audit(
        c,
        staff.userId,
        "staff.commission.milestone.added",
        staff.tenantId,
      );
      return { milestoneId: milestone.id };
    });
  }

  async setMilestone(
    staff: StaffContext,
    requestId: string,
    milestoneId: string,
    status: "planned" | "in_progress" | "done",
  ) {
    return this.tx(async (c) => {
      const row = await this.lockCommission(c, staff.tenantId, requestId);
      if (!this.mayEditMilestones(staff, row)) notFound();
      const updated = await c.query(
        "UPDATE commission_milestones SET status=$4,updated_by=$5,updated_at=now() WHERE tenant_id=$1 AND request_id=$2 AND id=$3",
        [staff.tenantId, requestId, milestoneId, status, staff.userId],
      );
      if (!updated.rowCount) notFound();
      await c.query(
        "UPDATE commercial_requests SET updated_at=now() WHERE id=$1",
        [requestId],
      );
      await this.audit(
        c,
        staff.userId,
        `staff.commission.milestone.${status}`,
        staff.tenantId,
      );
      if (status === "done")
        await enqueueNotification(
          c,
          staff.tenantId,
          "commission.milestone",
          requestId,
          { milestoneId },
          `commission.milestone:${milestoneId}:done`,
        );
      return { status };
    });
  }

  // --------------------------------------------------------------- customer

  async decide(
    userId: string,
    tenantId: string,
    requestId: string,
    quoteId: string,
    decision: "accept" | "decline",
    reason: string | null,
  ) {
    return this.tx(async (c) => {
      const row = await this.lockCommission(c, tenantId, requestId);
      if (row.requester_id !== userId) notFound();
      const quote = await c.query(
        `UPDATE commission_quotes SET status=$4,decided_at=now(),decline_reason=$5
         WHERE tenant_id=$1 AND request_id=$2 AND id=$3 AND status='proposed' RETURNING id`,
        [
          tenantId,
          requestId,
          quoteId,
          decision === "accept" ? "accepted" : "declined",
          decision === "decline" ? reason : null,
        ],
      );
      if (!quote.rowCount) fail(409, "That quote is no longer open");
      if (row.status !== "quoted")
        fail(409, "This commission is not waiting on a quote");
      // Accepted quotes wait for the deposit; staff confirm it by hand.
      const status = decision === "accept" ? "payment_pending" : "reviewing";
      await this.bump(c, tenantId, requestId, status);
      await this.audit(
        c,
        userId,
        `commission.quote.${decision === "accept" ? "accepted" : "declined"}`,
        tenantId,
      );
      // Tell the team (staff channel, no customer details).
      await enqueueNotification(
        c,
        tenantId,
        "commission.quote",
        requestId,
        { decision },
        `commission.quote:${quoteId}:${decision}`,
      );
      return { status };
    });
  }
}
