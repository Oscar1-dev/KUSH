import type { Pool, PoolClient } from "@kush/database";
import { transitions as commissionTransitions } from "./commercial-service.js";
import { enqueueNotification } from "./notifications.js";
import {
  can,
  demand,
  type StaffAccess,
  type StaffContext,
  type StaffRole,
} from "./staff-access.js";
import {
  reportCategoriesOf,
  SupportError,
  ticketTransitions,
} from "./support-service.js";

const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const notFound = () => fail(404, "Not found");

/** Developers may only move work along; managers run the whole journey. */
const developerMoves: Record<string, string[]> = {
  accepted: ["in_progress"],
  in_progress: ["awaiting_review"],
  awaiting_review: ["in_progress"],
};

export type TicketScope = "assigned" | "queue" | "all" | "reports";
export type CommissionScope = "assigned" | "all";

/**
 * Staff operations. Every query is scoped by the caller's permissions in SQL,
 * so an out-of-scope record looks exactly like a missing one (404).
 * Ticket rules: member reports are moderators' only; billing tickets are
 * confidential (manager and above); support staff work tickets assigned to
 * them or claimed from the unassigned queue.
 */
export class StaffService {
  constructor(
    private readonly pool: Pool,
    private readonly access: StaffAccess,
  ) {}

  private async tx<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(
    c: Pick<PoolClient, "query">,
    staff: StaffContext,
    action: string,
  ) {
    return c.query(
      "INSERT INTO audit_events(actor_id,action,tenant_id) VALUES($1,$2,$3)",
      [staff.userId, action, staff.tenantId],
    );
  }

  private async reportCategories(
    c: Pick<PoolClient, "query">,
    tenantId: string,
  ) {
    const tenant = await c.query<{ config: { reportCategories?: string[] } }>(
      "SELECT config FROM support_tenants WHERE id=$1",
      [tenantId],
    );
    return reportCategoriesOf(tenant.rows[0]?.config ?? {});
  }

  /** SQL predicate for the tickets this staff member may see at all. */
  private async ticketScope(
    c: Pick<PoolClient, "query">,
    staff: StaffContext,
    values: unknown[],
  ) {
    const reports = await this.reportCategories(c, staff.tenantId);
    values.push(reports, staff.userId);
    const r = `$${values.length - 1}::text[]`;
    const me = `$${values.length}::uuid`;
    const allowed: string[] = [];
    if (can(staff, "reports.handle")) allowed.push(`t.category = ANY(${r})`);
    const work: string[] = [];
    if (can(staff, "tickets.all")) work.push("TRUE");
    else {
      if (can(staff, "tickets.assigned"))
        work.push(`t.assigned_user_id = ${me}`);
      if (can(staff, "tickets.queue")) work.push("t.assigned_user_id IS NULL");
    }
    if (work.length) {
      const billing = can(staff, "tickets.billing")
        ? ""
        : " AND t.category <> 'billing'";
      allowed.push(
        `(NOT (t.category = ANY(${r})) AND (${work.join(" OR ")})${billing})`,
      );
    }
    return {
      // Both parameters are always referenced: PostgreSQL rejects a bound
      // parameter the statement never uses (08P01).
      predicate: `(${me} IS NOT NULL AND ${r} IS NOT NULL AND ${
        allowed.length ? `(${allowed.join(" OR ")})` : "FALSE"
      })`,
      reports,
      me,
    };
  }

  // ---------------------------------------------------------------- tickets

  async listTickets(staff: StaffContext, scope: TicketScope) {
    const values: unknown[] = [staff.tenantId];
    const { predicate, me, reports } = await this.ticketScope(
      this.pool,
      staff,
      values,
    );
    const filter = {
      assigned: `t.assigned_user_id = ${me} AND t.status <> 'closed'`,
      queue: "t.assigned_user_id IS NULL AND t.status <> 'closed'",
      all: "TRUE",
      reports: `t.category = ANY($${values.indexOf(reports) + 1}::text[])`,
    }[scope];
    const rows = await this.pool.query(
      `SELECT t.id,t.number,t.category,t.status,t.priority,t.description,t.version,
              t.created_at AS "createdAt",t.updated_at AS "updatedAt",
              t.assigned_user_id AS "assignedUserId",
              COALESCE(cu.display_name, ci.username, 'Customer') AS "customerName",
              COALESCE(au.display_name, ai.username) AS "assigneeName"
       FROM support_tickets t
       JOIN users cu ON cu.id=t.customer_id
       LEFT JOIN user_identities ci ON ci.user_id=t.customer_id AND ci.provider='discord'
       LEFT JOIN users au ON au.id=t.assigned_user_id
       LEFT JOIN user_identities ai ON ai.user_id=t.assigned_user_id AND ai.provider='discord'
       WHERE t.tenant_id=$1 AND ${predicate} AND ${filter}
       ORDER BY (t.status='closed'), t.updated_at DESC LIMIT 200`,
      values,
    );
    return rows.rows;
  }

  private async lockTicket(
    c: PoolClient,
    staff: StaffContext,
    ticketId: string,
  ) {
    const values: unknown[] = [staff.tenantId, ticketId];
    const { predicate } = await this.ticketScope(c, staff, values);
    const row = (
      await c.query<{
        id: string;
        status: string;
        version: number;
        assigned_user_id: string | null;
        category: string;
      }>(
        `SELECT t.id,t.status,t.version,t.assigned_user_id,t.category FROM support_tickets t
         WHERE t.tenant_id=$1 AND t.id=$2 AND ${predicate} FOR UPDATE`,
        values,
      )
    ).rows[0];
    return row ?? notFound();
  }

  async ticket(staff: StaffContext, ticketId: string) {
    const values: unknown[] = [staff.tenantId, ticketId];
    const { predicate } = await this.ticketScope(this.pool, staff, values);
    const ticket = (
      await this.pool.query(
        `SELECT t.id,t.number,t.category,t.status,t.priority,t.description,t.version,
                t.closure_reason AS "closureReason",t.created_at AS "createdAt",t.updated_at AS "updatedAt",
                t.assigned_user_id AS "assignedUserId",
                COALESCE(cu.display_name, ci.username, 'Customer') AS "customerName",
                ci.subject AS "customerDiscordId", cu.created_at AS "customerSince"
         FROM support_tickets t JOIN users cu ON cu.id=t.customer_id
         LEFT JOIN user_identities ci ON ci.user_id=t.customer_id AND ci.provider='discord'
         WHERE t.tenant_id=$1 AND t.id=$2 AND ${predicate}`,
        values,
      )
    ).rows[0];
    if (!ticket) notFound();
    const messages = await this.pool.query(
      `SELECT m.id,m.kind,m.content,m.created_at AS "createdAt",
              (m.author_id = (SELECT customer_id FROM support_tickets WHERE id=m.ticket_id)) AS "fromCustomer",
              COALESCE(u.display_name, i.username, 'KUSH team') AS "authorName"
       FROM support_messages m JOIN users u ON u.id=m.author_id
       LEFT JOIN user_identities i ON i.user_id=m.author_id AND i.provider='discord'
       WHERE m.tenant_id=$1 AND m.ticket_id=$2 ORDER BY m.created_at,m.id`,
      [staff.tenantId, ticketId],
    );
    const reports = await this.reportCategories(this.pool, staff.tenantId);
    const working = this.mayWork(
      staff,
      { assigned_user_id: ticket.assignedUserId, category: ticket.category },
      reports,
    );
    return {
      ticket,
      messages: messages.rows,
      // What this person may do right now (the UI offers only these; every
      // action is still re-checked when it is submitted).
      actions: {
        reply: working && ticket.status !== "closed",
        claim:
          can(staff, "tickets.queue") &&
          !ticket.assignedUserId &&
          !reports.includes(ticket.category),
        assign: can(staff, "tickets.assign") && ticket.status !== "closed",
        statuses:
          working && ticket.status !== "closed"
            ? [...(ticketTransitions[ticket.status] ?? []), "closed"]
            : [],
      },
    };
  }

  /** Workers on a ticket: its assignee, or anyone who may see all tickets. */
  private mayWork(
    staff: StaffContext,
    ticket: { assigned_user_id: string | null; category: string },
    reports: string[],
  ) {
    if (reports.includes(ticket.category)) return can(staff, "reports.handle");
    return (
      ticket.assigned_user_id === staff.userId || can(staff, "tickets.all")
    );
  }

  private async event(
    c: PoolClient,
    staff: StaffContext,
    ticketId: string,
    action: string,
    metadata: object,
    audience: "public" | "staff",
  ) {
    await c.query(
      "INSERT INTO support_events(tenant_id,ticket_id,actor_id,audience,action,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        staff.tenantId,
        ticketId,
        staff.userId,
        audience,
        action,
        JSON.stringify(metadata),
      ],
    );
    await this.audit(c, staff, `staff.${action}`);
  }

  /** Staff need a support membership row to author messages (FK). */
  private async ensureMember(c: PoolClient, staff: StaffContext) {
    await c.query(
      `INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer')
       ON CONFLICT (tenant_id,user_id) DO NOTHING`,
      [staff.tenantId, staff.userId],
    );
  }

  async message(
    staff: StaffContext,
    ticketId: string,
    input: {
      requestId: string;
      expectedVersion: number;
      kind: "reply" | "note";
      content: string;
    },
  ) {
    return this.tx(async (c) => {
      const ticket = await this.lockTicket(c, staff, ticketId);
      if (
        !this.mayWork(
          staff,
          ticket,
          await this.reportCategories(c, staff.tenantId),
        )
      )
        fail(403, "Claim this ticket before replying");
      const previous = await c.query(
        "SELECT 1 FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2 AND author_id=$3 AND request_id=$4",
        [staff.tenantId, ticketId, staff.userId, input.requestId],
      );
      if (previous.rowCount) return { version: ticket.version };
      if (ticket.version !== input.expectedVersion)
        fail(409, "Ticket changed; reload before retrying");
      if (ticket.status === "closed")
        fail(409, "Closed tickets cannot receive messages");
      await this.ensureMember(c, staff);
      const inserted = await c.query<{ id: string }>(
        "INSERT INTO support_messages(tenant_id,ticket_id,author_id,kind,content,request_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          staff.tenantId,
          ticketId,
          staff.userId,
          input.kind,
          input.content,
          input.requestId,
        ],
      );
      // Public replies reach Discord: mirrored into the ticket channel and a
      // DM to the customer. Internal notes are never announced.
      if (input.kind === "reply") {
        const messageId = inserted.rows[0]!.id;
        for (const audience of ["channel", "customer"])
          await enqueueNotification(
            c,
            staff.tenantId,
            "ticket.message",
            ticketId,
            { messageId, audience },
            `ticket.message:${messageId}:${audience}`,
          );
      }
      const updated = await c.query<{ version: number }>(
        "UPDATE support_tickets SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING version",
        [staff.tenantId, ticketId],
      );
      await this.event(
        c,
        staff,
        ticketId,
        input.kind === "note" ? "ticket.note" : "ticket.reply",
        {},
        input.kind === "note" ? "staff" : "public",
      );
      return { version: updated.rows[0]!.version };
    });
  }

  async setStatus(
    staff: StaffContext,
    ticketId: string,
    input: {
      expectedVersion: number;
      status: string;
      reason?: string | undefined;
    },
  ) {
    return this.tx(async (c) => {
      const ticket = await this.lockTicket(c, staff, ticketId);
      if (
        !this.mayWork(
          staff,
          ticket,
          await this.reportCategories(c, staff.tenantId),
        )
      )
        fail(403, "Claim this ticket before changing it");
      if (ticket.version !== input.expectedVersion)
        fail(409, "Ticket changed; reload before retrying");
      if (ticket.status === "closed")
        fail(409, "Closed tickets must be reopened first");
      if (input.status === "closed") {
        if (!input.reason) fail(400, "Give a reason for closing");
        await c.query(
          "UPDATE support_tickets SET status='closed',closure_reason=$3,closed_at=now(),version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [staff.tenantId, ticketId, input.reason],
        );
        await this.event(
          c,
          staff,
          ticketId,
          "ticket.closed",
          { reason: input.reason },
          "public",
        );
        await enqueueNotification(
          c,
          staff.tenantId,
          "ticket.status",
          ticketId,
          { status: "closed" },
          `ticket.status:${ticketId}:${ticket.version + 1}`,
        );
        return { status: "closed" };
      }
      if (!ticketTransitions[ticket.status]?.includes(input.status))
        fail(409, "That status change is not allowed");
      await c.query(
        "UPDATE support_tickets SET status=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [staff.tenantId, ticketId, input.status],
      );
      await this.event(
        c,
        staff,
        ticketId,
        "ticket.updated",
        { status: input.status },
        "public",
      );
      await enqueueNotification(
        c,
        staff.tenantId,
        "ticket.status",
        ticketId,
        { status: input.status },
        `ticket.status:${ticketId}:${ticket.version + 1}`,
      );
      return { status: input.status };
    });
  }

  async claim(staff: StaffContext, ticketId: string, expectedVersion: number) {
    demand(staff, "tickets.queue");
    return this.tx(async (c) => {
      const ticket = await this.lockTicket(c, staff, ticketId);
      if (ticket.version !== expectedVersion)
        fail(409, "Ticket changed; reload before retrying");
      if (ticket.assigned_user_id)
        fail(409, "Someone has already claimed this ticket");
      await this.ensureMember(c, staff);
      await c.query(
        "UPDATE support_tickets SET assigned_user_id=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [staff.tenantId, ticketId, staff.userId],
      );
      await this.event(c, staff, ticketId, "ticket.claimed", {}, "staff");
      return { assigned: true };
    });
  }

  async assignTicket(
    staff: StaffContext,
    ticketId: string,
    input: { expectedVersion: number; userId: string | null },
  ) {
    demand(staff, "tickets.assign");
    if (input.userId)
      await this.requireAssignee(staff, input.userId, [
        "support",
        "manager",
        "administrator",
        "owner",
      ]);
    return this.tx(async (c) => {
      const ticket = await this.lockTicket(c, staff, ticketId);
      if (ticket.version !== input.expectedVersion)
        fail(409, "Ticket changed; reload before retrying");
      await c.query(
        "UPDATE support_tickets SET assigned_user_id=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [staff.tenantId, ticketId, input.userId],
      );
      await this.event(
        c,
        staff,
        ticketId,
        "ticket.assigned",
        { userId: input.userId },
        "staff",
      );
      return { assigned: input.userId !== null };
    });
  }

  /** Assignees are checked against Discord now, not against the roster. */
  private async requireAssignee(
    staff: StaffContext,
    userId: string,
    eligible: StaffRole[],
  ) {
    const roles = await this.access.assigneeRoles(staff.tenantId, userId);
    if (!roles.some((role) => eligible.includes(role)))
      fail(400, "That person does not currently hold a suitable staff role");
  }

  // ------------------------------------------------------------ commissions

  private commissionScope(staff: StaffContext, values: unknown[]) {
    if (can(staff, "commissions.all")) return "TRUE";
    if (can(staff, "commissions.assigned")) {
      values.push(staff.userId);
      return `r.assigned_user_id = $${values.length}::uuid`;
    }
    return "FALSE";
  }

  async listCommissions(staff: StaffContext, scope: CommissionScope) {
    const values: unknown[] = [staff.tenantId];
    const allowed = this.commissionScope(staff, values);
    let filter = "TRUE";
    if (scope === "assigned") {
      values.push(staff.userId);
      filter = `r.assigned_user_id = $${values.length}::uuid`;
    }
    const rows = await this.pool.query(
      `SELECT r.id,r.title,r.category,r.status,r.version,r.created_at AS "createdAt",r.updated_at AS "updatedAt",
              r.assigned_user_id AS "assignedUserId",
              COALESCE(cu.display_name, ci.username, 'Customer') AS "customerName",
              COALESCE(au.display_name, ai.username) AS "assigneeName"
       FROM commercial_requests r JOIN users cu ON cu.id=r.requester_id
       LEFT JOIN user_identities ci ON ci.user_id=r.requester_id AND ci.provider='discord'
       LEFT JOIN users au ON au.id=r.assigned_user_id
       LEFT JOIN user_identities ai ON ai.user_id=r.assigned_user_id AND ai.provider='discord'
       WHERE r.tenant_id=$1 AND r.kind='commission' AND ${allowed} AND ${filter}
       ORDER BY (r.status IN ('completed','cancelled')), r.updated_at DESC LIMIT 200`,
      values,
    );
    return rows.rows;
  }

  async commission(staff: StaffContext, id: string) {
    const values: unknown[] = [staff.tenantId, id];
    const allowed = this.commissionScope(staff, values);
    const row = (
      await this.pool.query(
        `SELECT r.id,r.title,r.details,r.category,r.status,r.version,r.approximate_budget AS "approximateBudget",
                r.preferred_timeframe AS "preferredTimeframe",r.review_note AS "reviewNote",
                r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.assigned_user_id AS "assignedUserId",
                COALESCE(cu.display_name, ci.username, 'Customer') AS "customerName", ci.subject AS "customerDiscordId"
         FROM commercial_requests r JOIN users cu ON cu.id=r.requester_id
         LEFT JOIN user_identities ci ON ci.user_id=r.requester_id AND ci.provider='discord'
         WHERE r.tenant_id=$1 AND r.id=$2 AND r.kind='commission' AND ${allowed}`,
        values,
      )
    ).rows[0];
    if (!row) notFound();
    const statuses = can(staff, "commissions.manage")
      ? (commissionTransitions.commission[row.status] ?? [])
      : (developerMoves[row.status] ?? []);
    return {
      ...row,
      actions: {
        statuses,
        note: can(staff, "commissions.manage"),
        assign: can(staff, "commissions.assign"),
      },
    };
  }

  /** Developers may only move work along; managers run the whole journey. */
  async updateCommission(
    staff: StaffContext,
    id: string,
    input: {
      expectedVersion: number;
      status?: string | undefined;
      reviewNote?: string | null | undefined;
    },
  ) {
    return this.tx(async (c) => {
      const values: unknown[] = [staff.tenantId, id];
      const allowed = this.commissionScope(staff, values);
      const row = (
        await c.query<{ status: string; version: number }>(
          `SELECT r.status,r.version FROM commercial_requests r WHERE r.tenant_id=$1 AND r.id=$2 AND r.kind='commission' AND ${allowed} FOR UPDATE`,
          values,
        )
      ).rows[0];
      if (!row) notFound();
      if (row!.version !== input.expectedVersion)
        fail(409, "Commission changed; reload before retrying");
      const manager = can(staff, "commissions.manage");
      if (input.reviewNote !== undefined && !manager)
        fail(403, "Your staff role does not allow this");
      if (input.status) {
        const allowedMoves = manager
          ? (commissionTransitions.commission[row!.status] ?? [])
          : (developerMoves[row!.status] ?? []);
        if (!allowedMoves.includes(input.status))
          fail(409, "That status change is not allowed");
      }
      await c.query(
        `UPDATE commercial_requests SET status=COALESCE($3,status),
           review_note=CASE WHEN $4 THEN $5 ELSE review_note END,version=version+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [
          staff.tenantId,
          id,
          input.status ?? null,
          input.reviewNote !== undefined,
          input.reviewNote ?? null,
        ],
      );
      if (input.status)
        await enqueueNotification(
          c,
          staff.tenantId,
          "commission.status",
          id,
          { status: input.status },
          `commission.status:${id}:${row!.version + 1}`,
        );
      await this.audit(
        c,
        staff,
        input.status
          ? `staff.commission.status.${input.status}`
          : "staff.commission.note",
      );
      return { updated: true };
    });
  }

  async assignCommission(
    staff: StaffContext,
    id: string,
    input: { expectedVersion: number; userId: string | null },
  ) {
    demand(staff, "commissions.assign");
    if (input.userId)
      await this.requireAssignee(staff, input.userId, [
        "developer",
        "manager",
        "administrator",
        "owner",
      ]);
    return this.tx(async (c) => {
      const row = (
        await c.query<{ version: number }>(
          "SELECT version FROM commercial_requests WHERE tenant_id=$1 AND id=$2 AND kind='commission' FOR UPDATE",
          [staff.tenantId, id],
        )
      ).rows[0];
      if (!row) notFound();
      if (row!.version !== input.expectedVersion)
        fail(409, "Commission changed; reload before retrying");
      if (input.userId)
        await c.query(
          `INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'customer') ON CONFLICT (tenant_id,user_id) DO NOTHING`,
          [staff.tenantId, input.userId],
        );
      await c.query(
        "UPDATE commercial_requests SET assigned_user_id=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [staff.tenantId, id, input.userId],
      );
      await this.audit(c, staff, "staff.commission.assigned");
      return { assigned: input.userId !== null };
    });
  }

  // ------------------------------------------------------------ team, audit

  async team(staff: StaffContext) {
    demand(staff, "team.view");
    const rows = await this.pool.query(
      `SELECT s.user_id AS "userId", COALESCE(u.display_name, i.username, 'Staff') AS name,
              s.roles, s.last_verified_at AS "lastVerifiedAt",
              s.offboarded_at AS "offboardedAt", s.offboarded_reason AS "offboardedReason",
              a.number AS "applicationNumber",
              (SELECT g.signed_at FROM agreements g WHERE g.user_id=s.user_id AND g.status='signed'
               ORDER BY g.signed_at DESC LIMIT 1) AS "ndaSignedAt",
              (SELECT g.signed_via FROM agreements g WHERE g.user_id=s.user_id AND g.status='signed'
               ORDER BY g.signed_at DESC LIMIT 1) AS "ndaSignedVia"
       FROM staff_members s JOIN users u ON u.id=s.user_id AND NOT u.disabled
       LEFT JOIN staff_applications a ON a.id=s.application_id
       LEFT JOIN user_identities i ON i.user_id=s.user_id AND i.provider='discord'
       WHERE s.tenant_id=$1 ORDER BY s.offboarded_at IS NOT NULL, name`,
      [staff.tenantId],
    );
    return rows.rows;
  }

  async auditLog(staff: StaffContext) {
    demand(staff, "audit.view");
    const rows = await this.pool.query(
      `SELECT a.id,a.action,a.created_at AS "createdAt",
              COALESCE(u.display_name, i.username) AS "actorName"
       FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id
       LEFT JOIN user_identities i ON i.user_id=a.actor_id AND i.provider='discord'
       WHERE a.tenant_id=$1 OR a.action LIKE 'staff.%' OR a.action LIKE 'mfa.%' OR a.action LIKE 'auth.%'
       ORDER BY a.created_at DESC LIMIT 200`,
      [staff.tenantId],
    );
    return rows.rows;
  }

  async overview(staff: StaffContext) {
    const [assigned, queue, commissions] = await Promise.all([
      can(staff, "tickets.assigned") ? this.listTickets(staff, "assigned") : [],
      can(staff, "tickets.queue") ? this.listTickets(staff, "queue") : [],
      can(staff, "commissions.assigned")
        ? this.listCommissions(staff, "assigned")
        : [],
    ]);
    const reports = can(staff, "reports.handle")
      ? (await this.listTickets(staff, "reports")).filter(
          (t) => t.status !== "closed",
        )
      : [];
    return {
      assignedTickets: assigned.length,
      queuedTickets: queue.length,
      openReports: reports.length,
      activeCommissions: commissions.filter(
        (c) => !["completed", "cancelled"].includes(c.status),
      ).length,
    };
  }
}
