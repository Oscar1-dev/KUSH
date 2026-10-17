import type { Pool, PoolClient } from "@kush/database";
import { isDeepStrictEqual } from "node:util";
import type {
  User,
  SupportRole,
  SupportTenant,
  SupportTicket,
  SupportMessage,
  SupportEvent,
  SupportMember,
  SupportTicketDetail,
} from "@kush/contracts";
import {
  defaultReportCategories,
  tenantInputSchema,
  ticketInputSchema,
  ticketPatchSchema,
  messageInputSchema,
  memberInputSchema,
  closeTicketSchema,
  reopenTicketSchema,
  z,
} from "@kush/contracts";
export class SupportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
type TenantRow = {
  id: string;
  name: string;
  client_id: string | null;
  project_id: string | null;
  guild_id: string | null;
  guild_status: "unverified";
  config: SupportTenant["config"];
  created_at: Date;
  updated_at: Date;
};
type TicketRow = {
  id: string;
  tenant_id: string;
  number: number;
  customer_id: string;
  category: string;
  create_category: string;
  status: SupportTicket["status"];
  priority: SupportTicket["priority"];
  assigned_user_id: string | null;
  version: number;
  description: string;
  closure_reason: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
};
const tenantView = (r: TenantRow, role: SupportRole): SupportTenant => ({
  id: r.id,
  name: r.name,
  clientId: r.client_id,
  projectId: r.project_id,
  guildId: r.guild_id,
  guildStatus: r.guild_status,
  config: r.config,
  currentUserRole: role,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const ticketView = (r: TicketRow): SupportTicket => ({
  id: r.id,
  tenantId: r.tenant_id,
  number: r.number,
  customerId: r.customer_id,
  category: r.category,
  status: r.status,
  priority: r.priority,
  assignedUserId: r.assigned_user_id,
  version: r.version,
  description: r.description,
  closureReason: r.closure_reason,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  closedAt: r.closed_at?.toISOString() ?? null,
});
type Queryable = Pick<PoolClient, "query">;
const fail = (status: number, message: string): never => {
  throw new SupportError(status, message);
};
const notFound = () => fail(404, "Support resource not found");
/** Moderation-report categories for a tenant (moderators only, never staff). */
export const reportCategoriesOf = (config: { reportCategories?: string[] }) =>
  config.reportCategories ?? [...defaultReportCategories];
export class SupportService {
  constructor(private pool: Pool) {}
  private async transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      if (error instanceof SupportError) throw error;
      const code = (error as { code?: string }).code;
      if (code === "23505") fail(409, "Support record already exists");
      if (code === "23503") fail(409, "Support record is still referenced");
      throw error;
    } finally {
      c.release();
    }
  }
  private async tenant(c: Queryable, id: string, user: User, lock = false) {
    const result = await c.query<TenantRow>(
      `SELECT * FROM support_tenants WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    const tenant = result.rows[0];
    if (!tenant) return notFound();
    const member = await c.query<{ role: SupportRole; app_role: string }>(
      `SELECT m.role,u.role AS app_role FROM support_members m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active AND NOT u.disabled`,
      [id, user.id],
    );
    const membership = member.rows[0];
    if (!membership) return notFound();
    if (
      membership.role !== "customer" &&
      !["admin", "operator"].includes(membership.app_role)
    )
      return notFound();
    return { tenant, role: membership.role };
  }
  private owner(role: SupportRole) {
    if (role !== "owner") fail(403, "Tenant owner permission required");
  }
  private async ticket(
    c: Queryable,
    tenantId: string,
    ticketId: string,
    user: User,
    role: SupportRole,
    lock = false,
  ) {
    const result = await c.query<
      TicketRow & { report_categories: string[] | null }
    >(
      `SELECT t.*,st.config->'reportCategories' AS report_categories FROM support_tickets t JOIN support_tenants st ON st.id=t.tenant_id WHERE t.tenant_id=$1 AND t.id=$2${lock ? " FOR UPDATE OF t" : ""}`,
      [tenantId, ticketId],
    );
    const row = result.rows[0];
    if (!row) return notFound();
    const { report_categories, ...ticket } = row;
    const report = reportCategoriesOf({
      reportCategories: report_categories ?? undefined,
    }).includes(ticket.category);
    if (role === "customer" && ticket.customer_id !== user.id)
      return notFound();
    if (role === "staff" && (report || ticket.assigned_user_id !== user.id))
      return notFound();
    if (role === "moderator" && !report) return notFound();
    return ticket as TicketRow;
  }
  private async audit(
    c: Queryable,
    tenantId: string,
    userId: string,
    action: string,
  ) {
    await c.query(
      "INSERT INTO audit_events(actor_id,tenant_id,action) VALUES($1,$2,$3)",
      [userId, tenantId, action],
    );
  }
  private async event(
    c: Queryable,
    ticket: TicketRow,
    user: User,
    action: string,
    metadata: Record<string, unknown> = {},
    audience: "public" | "staff" = "public",
  ) {
    await c.query(
      "INSERT INTO support_events(tenant_id,ticket_id,actor_id,audience,action,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        ticket.tenant_id,
        ticket.id,
        user.id,
        audience,
        action,
        JSON.stringify(metadata),
      ],
    );
    await this.audit(c, ticket.tenant_id, user.id, `support.${action}`);
  }
  private version(ticket: TicketRow, expected: number) {
    if (ticket.version !== expected)
      fail(409, "Ticket changed; reload before retrying");
  }
  private async link(
    c: Queryable,
    clientId: string | null,
    projectId: string | null,
  ) {
    if (projectId && !clientId) fail(400, "A project requires its client");
    if (clientId) {
      const client = await c.query(
        "SELECT id FROM clients WHERE id=$1 AND NOT archived",
        [clientId],
      );
      if (!client.rowCount) fail(400, "Client association is unavailable");
    }
    if (projectId) {
      const project = await c.query(
        "SELECT id FROM projects WHERE id=$1 AND client_id=$2",
        [projectId, clientId],
      );
      if (!project.rowCount)
        fail(400, "Project must belong to the selected client");
    }
  }
  async listTenants(user: User) {
    const result = await this.pool.query<TenantRow & { role: SupportRole }>(
      `SELECT t.*,m.role FROM support_tenants t JOIN support_members m ON m.tenant_id=t.id JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.active AND NOT u.disabled AND (m.role='customer' OR u.role IN('admin','operator')) ORDER BY t.created_at,t.id`,
      [user.id],
    );
    return result.rows.map((r) => tenantView(r, r.role));
  }
  async createTenant(user: User, input: z.infer<typeof tenantInputSchema>) {
    if (user.role !== "admin") fail(403, "Administrator permission required");
    return this.transaction(async (c) => {
      await this.link(c, input.clientId, input.projectId);
      const result = await c.query<TenantRow>(
        "INSERT INTO support_tenants(name,client_id,project_id,guild_id,config) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          input.name,
          input.clientId,
          input.projectId,
          input.guildId,
          JSON.stringify(input.config),
        ],
      );
      const tenant = result.rows[0]!;
      await c.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'owner')",
        [tenant.id, user.id],
      );
      await this.audit(c, tenant.id, user.id, "support.tenant.created");
      return tenantView(tenant, "owner");
    });
  }
  async getTenant(user: User, id: string) {
    const { tenant, role } = await this.tenant(this.pool, id, user);
    return tenantView(tenant, role);
  }
  async updateTenant(
    user: User,
    id: string,
    input: z.infer<typeof tenantInputSchema>,
  ) {
    return this.transaction(async (c) => {
      const { tenant, role } = await this.tenant(c, id, user, true);
      this.owner(role);
      if (
        (tenant.client_id !== input.clientId ||
          tenant.project_id !== input.projectId) &&
        user.role !== "admin"
      )
        fail(
          403,
          "Administrator permission required to change client associations",
        );
      await this.link(c, input.clientId, input.projectId);
      const result = await c.query<TenantRow>(
        "UPDATE support_tenants SET name=$2,client_id=$3,project_id=$4,guild_id=$5,config=$6,updated_at=now() WHERE id=$1 RETURNING *",
        [
          id,
          input.name,
          input.clientId,
          input.projectId,
          input.guildId,
          JSON.stringify(input.config),
        ],
      );
      await this.audit(c, id, user.id, "support.tenant.updated");
      return tenantView(result.rows[0]!, role);
    });
  }
  async members(user: User, id: string) {
    const { role } = await this.tenant(this.pool, id, user);
    this.owner(role);
    const result = await this.pool.query<SupportMember>(
      `SELECT m.user_id AS "userId",u.email,m.role,u.disabled,u.role AS "appRole" FROM support_members m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.active ORDER BY u.email`,
      [id],
    );
    return result.rows;
  }
  async putMember(
    user: User,
    id: string,
    input: z.infer<typeof memberInputSchema>,
  ) {
    return this.transaction(async (c) => {
      const { role } = await this.tenant(c, id, user, true);
      this.owner(role);
      const target = await c.query<{ role: string }>(
        "SELECT role FROM users WHERE id=$1 AND NOT disabled FOR SHARE",
        [input.userId],
      );
      if (!target.rowCount)
        fail(400, "An enabled application account is required");
      if (
        input.role === "customer"
          ? target.rows[0]!.role !== "customer"
          : !["admin", "operator"].includes(target.rows[0]!.role)
      )
        fail(400, "Application account role is incompatible with tenant role");
      await this.protectOwner(c, id, input.userId, input.role);
      await c.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true",
        [id, input.userId, input.role],
      );
      await this.audit(c, id, user.id, "support.member.updated");
      const member = await c.query<SupportMember>(
        `SELECT m.user_id AS "userId",u.email,m.role,u.disabled,u.role AS "appRole" FROM support_members m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2`,
        [id, input.userId],
      );
      return member.rows[0]!;
    });
  }
  private async protectOwner(
    c: Queryable,
    id: string,
    userId: string,
    nextRole?: SupportRole,
  ) {
    const old = await c.query<{ role: SupportRole; active: boolean }>(
      "SELECT role,active FROM support_members WHERE tenant_id=$1 AND user_id=$2",
      [id, userId],
    );
    if (
      old.rows[0]?.active &&
      old.rows[0].role === "owner" &&
      nextRole !== "owner"
    ) {
      const owners = await c.query(
        "SELECT m.user_id FROM support_members m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.role='owner' AND m.active AND NOT u.disabled AND u.role IN('admin','operator')",
        [id],
      );
      if (owners.rowCount! <= 1)
        fail(409, "The last enabled tenant owner cannot be removed");
    }
  }
  async removeMember(user: User, id: string, userId: string) {
    await this.transaction(async (c) => {
      const { role } = await this.tenant(c, id, user, true);
      this.owner(role);
      await this.protectOwner(c, id, userId);
      const result = await c.query(
        "UPDATE support_members SET active=false WHERE tenant_id=$1 AND user_id=$2 AND active RETURNING user_id",
        [id, userId],
      );
      if (!result.rowCount) notFound();
      await this.audit(c, id, user.id, "support.member.removed");
    });
  }
  async listTickets(
    user: User,
    id: string,
    query: {
      search?: string;
      status?: string;
      priority?: string;
      assignedUserId?: string;
    },
  ) {
    const { tenant, role } = await this.tenant(this.pool, id, user);
    const values: unknown[] = [id];
    const predicates = ["tenant_id=$1"];
    const reports = reportCategoriesOf(tenant.config);
    const add = (sql: string, value: unknown) => {
      values.push(value);
      predicates.push(sql.replace("?", `$${values.length}`));
    };
    if (role === "customer") add("customer_id=?", user.id);
    if (role === "staff") {
      add("assigned_user_id=?", user.id);
      add("NOT (category = ANY(?::text[]))", reports);
    }
    if (role === "moderator") add("category = ANY(?::text[])", reports);
    if (query.search)
      add(
        "(description ILIKE ? ESCAPE '\\')",
        `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
      );
    if (query.status) add("status=?", query.status);
    if (query.priority) add("priority=?", query.priority);
    if (query.assignedUserId) add("assigned_user_id=?", query.assignedUserId);
    const result = await this.pool.query<TicketRow>(
      `SELECT * FROM support_tickets WHERE ${predicates.join(" AND ")} ORDER BY updated_at DESC,id LIMIT 200`,
      values,
    );
    return result.rows.map(ticketView);
  }
  async createTicket(
    user: User,
    id: string,
    input: z.infer<typeof ticketInputSchema>,
  ) {
    return this.transaction(async (c) => {
      const { tenant, role } = await this.tenant(c, id, user, true);
      const previous = await c.query<TicketRow>(
        "SELECT * FROM support_tickets WHERE tenant_id=$1 AND customer_id=$2 AND create_request_id=$3",
        [id, user.id, input.requestId],
      );
      if (previous.rows[0]) {
        const ticket = await this.ticket(
          c,
          id,
          previous.rows[0].id,
          user,
          role,
        );
        if (
          ticket.create_category !== input.category ||
          ticket.description !== input.description
        )
          fail(
            409,
            "Idempotency key was already used for different ticket data",
          );
        return ticketView(ticket);
      }
      if (!tenant.config.categories.some((v) => v.key === input.category))
        fail(400, "Choose a configured category");
      const number = await c.query<{ number: number }>(
        "UPDATE support_tenants SET next_ticket_number=next_ticket_number+1 WHERE id=$1 RETURNING next_ticket_number-1 AS number",
        [id],
      );
      const result = await c.query<TicketRow>(
        "INSERT INTO support_tickets(tenant_id,number,customer_id,category,description,create_request_id,create_category,assigned_user_id) VALUES($1,$2,$3,$4,$5,$6,$4,$7) RETURNING *",
        [
          id,
          number.rows[0]!.number,
          user.id,
          input.category,
          input.description,
          input.requestId,
          role === "staff" ? user.id : null,
        ],
      );
      await this.event(c, result.rows[0]!, user, "ticket.created");
      return ticketView(result.rows[0]!);
    });
  }
  async detail(
    user: User,
    id: string,
    ticketId: string,
  ): Promise<SupportTicketDetail> {
    return this.transaction(async (c) => {
      const { role } = await this.tenant(c, id, user, true);
      const ticket = await this.ticket(c, id, ticketId, user, role);
      const messages = await c.query<SupportMessage & { createdAt: Date }>(
        `SELECT id,ticket_id AS "ticketId",author_id AS "authorId",kind,content,created_at AS "createdAt" FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2 ${role === "customer" ? "AND kind='reply'" : ""} ORDER BY created_at,id`,
        [id, ticketId],
      );
      const events = await c.query<SupportEvent & { createdAt: Date }>(
        `SELECT id,ticket_id AS "ticketId",actor_id AS "actorId",action,metadata,created_at AS "createdAt" FROM support_events WHERE tenant_id=$1 AND ticket_id=$2 ${role === "customer" ? "AND audience='public'" : ""} ORDER BY created_at,id`,
        [id, ticketId],
      );
      return {
        ticket: ticketView(ticket),
        messages: messages.rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        events: events.rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }
  async patchTicket(
    user: User,
    id: string,
    ticketId: string,
    input: z.infer<typeof ticketPatchSchema>,
  ) {
    return this.transaction(async (c) => {
      const { tenant, role } = await this.tenant(c, id, user, true);
      const ticket = await this.ticket(c, id, ticketId, user, role, true);
      if (role === "customer") fail(403, "Assigned staff permission required");
      this.version(ticket, input.expectedVersion);
      if (ticket.status === "closed")
        fail(409, "Closed tickets must be explicitly reopened");
      if (input.assignedUserId !== undefined) {
        this.owner(role);
        if (input.assignedUserId) {
          const handlers = reportCategoriesOf(tenant.config).includes(
            ticket.category,
          )
            ? ["owner", "moderator"]
            : ["owner", "staff"];
          const candidate = await c.query(
            "SELECT m.user_id FROM support_members m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active AND m.role = ANY($3::text[]) AND NOT u.disabled AND u.role IN('admin','operator')",
            [id, input.assignedUserId, handlers],
          );
          if (!candidate.rowCount)
            fail(400, "Assignment requires active tenant staff");
        }
      }
      if (
        input.category &&
        !tenant.config.categories.some((v) => v.key === input.category)
      )
        fail(400, "Choose a configured category");
      if (input.status && input.status !== ticket.status) {
        const transitions: Record<string, string[]> = {
          open: ["pending", "in_progress", "waiting_for_customer", "resolved"],
          pending: ["open", "in_progress", "waiting_for_customer", "resolved"],
          in_progress: ["pending", "waiting_for_customer", "resolved"],
          waiting_for_customer: ["pending", "in_progress", "resolved"],
          resolved: ["in_progress", "waiting_for_customer"],
          reopened: [
            "pending",
            "in_progress",
            "waiting_for_customer",
            "resolved",
          ],
        };
        if (!transitions[ticket.status]?.includes(input.status))
          fail(
            409,
            "Unsupported status transition; use explicit close or reopen",
          );
      }
      const next = {
        status: input.status ?? ticket.status,
        priority: input.priority ?? ticket.priority,
        category: input.category ?? ticket.category,
        assignedUserId:
          input.assignedUserId === undefined
            ? ticket.assigned_user_id
            : input.assignedUserId,
      };
      const result = await c.query<TicketRow>(
        "UPDATE support_tickets SET status=$3,priority=$4,category=$5,assigned_user_id=$6,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [
          id,
          ticketId,
          next.status,
          next.priority,
          next.category,
          next.assignedUserId,
        ],
      );
      await this.event(c, result.rows[0]!, user, "ticket.updated", next);
      return ticketView(result.rows[0]!);
    });
  }
  async message(
    user: User,
    id: string,
    ticketId: string,
    input: z.infer<typeof messageInputSchema>,
  ) {
    return this.transaction(async (c) => {
      const { role } = await this.tenant(c, id, user, true);
      const ticket = await this.ticket(c, id, ticketId, user, role, true);
      if (input.kind === "note" && role === "customer")
        fail(403, "Internal notes require assigned staff permission");
      const previous = await c.query<{ kind: string; content: string }>(
        "SELECT kind,content FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2 AND author_id=$3 AND request_id=$4",
        [id, ticketId, user.id, input.requestId],
      );
      if (previous.rows[0]) {
        if (
          !isDeepStrictEqual(previous.rows[0], {
            kind: input.kind,
            content: input.content,
          })
        )
          fail(
            409,
            "Idempotency key was already used for different message data",
          );
        return ticketView(ticket);
      }
      this.version(ticket, input.expectedVersion);
      if (ticket.status === "closed")
        fail(409, "Closed tickets cannot receive messages");
      await c.query(
        "INSERT INTO support_messages(tenant_id,ticket_id,author_id,kind,content,request_id) VALUES($1,$2,$3,$4,$5,$6)",
        [id, ticketId, user.id, input.kind, input.content, input.requestId],
      );
      const result = await c.query<TicketRow>(
        "UPDATE support_tickets SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [id, ticketId],
      );
      await this.event(
        c,
        result.rows[0]!,
        user,
        input.kind === "note" ? "ticket.note" : "ticket.reply",
        {},
        input.kind === "note" ? "staff" : "public",
      );
      return ticketView(result.rows[0]!);
    });
  }
  async close(
    user: User,
    id: string,
    ticketId: string,
    input: z.infer<typeof closeTicketSchema>,
  ) {
    return this.transaction(async (c) => {
      const { role } = await this.tenant(c, id, user, true);
      const ticket = await this.ticket(c, id, ticketId, user, role, true);
      this.version(ticket, input.expectedVersion);
      if (ticket.status === "closed") fail(409, "Ticket is already closed");
      const result = await c.query<TicketRow>(
        "UPDATE support_tickets SET status='closed',closure_reason=$3,closed_at=now(),updated_at=now(),version=version+1 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [id, ticketId, input.reason],
      );
      await this.event(c, result.rows[0]!, user, "ticket.closed", {
        reason: input.reason,
      });
      return ticketView(result.rows[0]!);
    });
  }
  async reopen(
    user: User,
    id: string,
    ticketId: string,
    input: z.infer<typeof reopenTicketSchema>,
  ) {
    return this.transaction(async (c) => {
      const { tenant, role } = await this.tenant(c, id, user, true);
      const ticket = await this.ticket(c, id, ticketId, user, role, true);
      this.version(ticket, input.expectedVersion);
      if (!tenant.config.allowReopen)
        fail(409, "Reopening is disabled by tenant policy");
      if (ticket.status !== "closed")
        fail(409, "Only closed tickets can be reopened");
      const result = await c.query<TicketRow>(
        "UPDATE support_tickets SET status='reopened',closure_reason=NULL,closed_at=NULL,updated_at=now(),version=version+1 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [id, ticketId],
      );
      await this.event(c, result.rows[0]!, user, "ticket.reopened");
      return ticketView(result.rows[0]!);
    });
  }
  /** Lets support staff or moderators take an unassigned ticket in their queue. */
  async claim(user: User, id: string, ticketId: string) {
    return this.transaction(async (c) => {
      const { tenant, role } = await this.tenant(c, id, user, true);
      if (role === "customer") return notFound();
      const result = await c.query<TicketRow>(
        "SELECT * FROM support_tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [id, ticketId],
      );
      const ticket = result.rows[0] ?? notFound();
      const report = reportCategoriesOf(tenant.config).includes(
        ticket.category,
      );
      if ((role === "staff" && report) || (role === "moderator" && !report))
        return notFound();
      if (ticket.status === "closed")
        fail(409, "Closed tickets must be explicitly reopened");
      if (ticket.assigned_user_id === user.id) return ticketView(ticket);
      if (ticket.assigned_user_id && role !== "owner")
        fail(409, "Ticket is already claimed by another staff member");
      const updated = await c.query<TicketRow>(
        "UPDATE support_tickets SET assigned_user_id=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [id, ticketId, user.id],
      );
      await this.event(c, updated.rows[0]!, user, "ticket.claimed", {
        previousAssignee: ticket.assigned_user_id,
      });
      return ticketView(updated.rows[0]!);
    });
  }

  /** Unassigned open tickets the caller may claim. Summary only: no description. */
  async queue(user: User, id: string) {
    const { tenant, role } = await this.tenant(this.pool, id, user);
    if (role === "customer") return notFound();
    const reports = reportCategoriesOf(tenant.config);
    const filter =
      role === "staff"
        ? "AND NOT (t.category = ANY($2::text[]))"
        : role === "moderator"
          ? "AND t.category = ANY($2::text[])"
          : "AND ($2::text[] IS NOT NULL)";
    const result = await this.pool.query<{
      id: string;
      number: number;
      category: string;
      priority: string;
      status: string;
      created_at: Date;
      channel_id: string | null;
    }>(
      `SELECT t.id,t.number,t.category,t.priority,t.status,t.created_at,d.channel_id
       FROM support_tickets t LEFT JOIN discord_ticket_channels d ON d.tenant_id=t.tenant_id AND d.ticket_id=t.id
       WHERE t.tenant_id=$1 AND t.assigned_user_id IS NULL AND t.status<>'closed' ${filter}
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,t.created_at
       LIMIT 50`,
      [id, reports],
    );
    return result.rows.map((row) => ({
      ticketId: row.id,
      number: row.number,
      category: row.category,
      priority: row.priority,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      channelId: row.channel_id,
    }));
  }

  /** Resolves a ticket number with the same visibility rules as get. */
  async byNumber(user: User, id: string, number: number) {
    const { role } = await this.tenant(this.pool, id, user);
    const found = await this.pool.query<{ id: string }>(
      "SELECT id FROM support_tickets WHERE tenant_id=$1 AND number=$2",
      [id, number],
    );
    if (!found.rows[0]) return notFound();
    return ticketView(
      await this.ticket(this.pool, id, found.rows[0].id, user, role),
    );
  }
}
