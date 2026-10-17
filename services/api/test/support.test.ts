import { describe, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { buildApp } from "../src/app.js";
import { tokenHash } from "../src/password.js";

const databaseUrl = process.env.KUSH_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL tenant support boundaries", () => {
  it("isolates tenants, assigned staff and customer transcripts; persists an idempotent ticket lifecycle", async () => {
    const { pool } = createDatabase(databaseUrl!);
    const app = await buildApp(databaseUrl!);
    const users: string[] = [];
    const tenants: string[] = [];
    const clients: string[] = [];
    const headers: Record<string, { authorization: string }> = {};
    const ids: Record<string, string> = {};
    const config = {
      categories: [
        { key: "support", label: "Support" },
        { key: "billing", label: "Billing" },
      ],
      retentionDays: null,
      allowReopen: true,
    };
    const call = (
      method: "GET" | "POST" | "PATCH" | "DELETE",
      path: string,
      actor = "owner",
      payload?: object,
    ) =>
      app.inject({
        method,
        url: path,
        headers: headers[actor],
        ...(payload ? { payload } : {}),
      });
    const check = async (
      method: "GET" | "POST" | "PATCH" | "DELETE",
      path: string,
      actor: string,
      payload: object | undefined,
      status: number,
    ) => {
      const response = await call(method, path, actor, payload);
      expect(response.statusCode, `${method} ${path}: ${response.body}`).toBe(
        status,
      );
      return response;
    };
    try {
      for (const [name, role] of Object.entries({
        owner: "admin",
        outsider: "admin",
        staff: "operator",
        otherStaff: "operator",
        customer: "customer",
        otherCustomer: "customer",
        viewer: "viewer",
        disabled: "operator",
      })) {
        const id = randomUUID();
        users.push(id);
        ids[name] = id;
        await pool.query(
          "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4)",
          [id, `${id}@test.invalid`, "unused-injected-session", role],
        );
        const token = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [tokenHash(token), id],
        );
        headers[name] = { authorization: `Bearer ${token}` };
      }
      const createTenant = async (name: string, actor = "owner") => {
        const response = await check(
          "POST",
          "/support/tenants",
          actor,
          { name, config },
          201,
        );
        const tenant = response.json().tenant;
        tenants.push(tenant.id);
        return tenant;
      };
      const tenant = await createTenant("TEST local support");
      const otherTenant = await createTenant(
        "TEST isolated organisation",
        "outsider",
      );
      const base = `/support/tenants/${tenant.id}`;
      await check("GET", base, "outsider", undefined, 404);
      expect(
        (await call("GET", "/support/tenants", "outsider"))
          .json()
          .tenants.map((x: { id: string }) => x.id),
      ).not.toContain(tenant.id);
      for (const [name, role] of Object.entries({
        staff: "staff",
        otherStaff: "staff",
        customer: "customer",
        otherCustomer: "customer",
        disabled: "staff",
      }))
        await check(
          "POST",
          `${base}/members`,
          "owner",
          { userId: ids[name], role },
          200,
        );
      await check(
        "POST",
        `${base}/members`,
        "owner",
        { userId: ids.viewer, role: "staff" },
        400,
      );
      await check(
        "POST",
        `${base}/members`,
        "customer",
        { userId: ids.customer, role: "owner" },
        403,
      );
      await pool.query("UPDATE users SET disabled=true WHERE id=$1", [
        ids.disabled,
      ]);
      await check("GET", base, "disabled", undefined, 401);
      for (const route of [
        "/clients",
        "/projects",
        "/profiles",
        "/activity",
        "/audit",
        "/admin/users",
      ])
        await check("GET", route, "customer", undefined, 403);
      await check("GET", `${base}/members`, "customer", undefined, 403);
      await check("GET", `${base}/members`, "staff", undefined, 403);
      const staffCreate = {
        requestId: randomUUID(),
        category: "support",
        description: "TEST staff-created issue",
      };
      let staffTicket = (
        await check("POST", `${base}/tickets`, "staff", staffCreate, 201)
      ).json().ticket;
      const staffPath = `${base}/tickets/${staffTicket.id}`;
      expect(staffTicket.assignedUserId).toBe(ids.staff);
      await check("GET", staffPath, "staff", undefined, 200);
      staffTicket = (
        await check(
          "PATCH",
          staffPath,
          "owner",
          {
            expectedVersion: staffTicket.version,
            assignedUserId: ids.otherStaff,
          },
          200,
        )
      ).json().ticket;
      await check("POST", `${base}/tickets`, "staff", staffCreate, 404);
      await check(
        "POST",
        `${base}/tickets`,
        "customer",
        {
          requestId: randomUUID(),
          category: "missing",
          description: "invalid category",
        },
        400,
      );
      const requestId = randomUUID();
      const create = {
        requestId,
        category: "support",
        description: "TEST private customer issue <script>alert(1)</script>",
      };
      let ticket = (
        await check("POST", `${base}/tickets`, "customer", create, 201)
      ).json().ticket;
      const path = `${base}/tickets/${ticket.id}`;
      const duplicate = await call(
        "POST",
        `${base}/tickets`,
        "customer",
        create,
      );
      expect(duplicate.statusCode).toBe(201);
      expect(duplicate.json().ticket.id).toBe(ticket.id);
      expect(duplicate.json().ticket.version).toBe(ticket.version);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM support_tickets WHERE tenant_id=$1",
            [tenant.id],
          )
        ).rows[0].count,
      ).toBe(2);
      await check(
        "POST",
        `${base}/tickets`,
        "customer",
        { ...create, description: "different payload" },
        409,
      );
      await check("GET", path, "otherCustomer", undefined, 404);
      await check("GET", path, "staff", undefined, 404);
      await check(
        "GET",
        `/support/tenants/${otherTenant.id}/tickets/${ticket.id}`,
        "outsider",
        undefined,
        404,
      );
      expect(
        (await call("GET", `${base}/tickets`, "otherCustomer")).json().tickets,
      ).toEqual([]);
      const patch = async (changes: object, expected = 200) => {
        const response = await check(
          "PATCH",
          path,
          "owner",
          { expectedVersion: ticket.version, ...changes },
          expected,
        );
        if (expected === 200) ticket = response.json().ticket;
      };
      await patch({ assignedUserId: ids.outsider }, 400);
      await patch({ assignedUserId: ids.customer }, 400);
      await patch({ assignedUserId: ids.disabled }, 400);
      await patch({ assignedUserId: ids.staff, priority: "high" });
      await patch({ category: "billing" });
      const originalReplay = await check(
        "POST",
        `${base}/tickets`,
        "customer",
        create,
        201,
      );
      expect(originalReplay.json().ticket.id).toBe(ticket.id);
      expect(originalReplay.json().ticket.category).toBe("billing");
      expect(originalReplay.json().ticket.version).toBe(ticket.version);
      await check(
        "POST",
        `${base}/tickets`,
        "customer",
        { ...create, category: "billing" },
        409,
      );
      await check("GET", path, "staff", undefined, 200);
      await check("GET", path, "otherStaff", undefined, 404);
      await check(
        "PATCH",
        path,
        "customer",
        { expectedVersion: ticket.version, priority: "urgent" },
        403,
      );
      await check(
        "PATCH",
        path,
        "owner",
        { expectedVersion: 999, priority: "urgent" },
        409,
      );
      const messageId = randomUUID();
      const note = {
        requestId: messageId,
        expectedVersion: ticket.version,
        kind: "note",
        content: "SECRET internal note TEST",
      };
      ticket = (
        await check("POST", `${path}/messages`, "staff", note, 200)
      ).json().ticket;
      const messageReplay = await call(
        "POST",
        `${path}/messages`,
        "staff",
        note,
      );
      expect(messageReplay.statusCode).toBe(200);
      expect(messageReplay.json().ticket.version).toBe(ticket.version);
      await check(
        "POST",
        `${path}/messages`,
        "staff",
        { ...note, content: "changed" },
        409,
      );
      await check(
        "POST",
        `${path}/messages`,
        "customer",
        { ...note, requestId: randomUUID(), expectedVersion: ticket.version },
        403,
      );
      ticket = (
        await check(
          "POST",
          `${path}/messages`,
          "customer",
          {
            requestId: randomUUID(),
            expectedVersion: ticket.version,
            kind: "reply",
            content: "TEST public reply",
          },
          200,
        )
      ).json().ticket;
      await check(
        "POST",
        `${path}/messages`,
        "staff",
        {
          requestId: randomUUID(),
          expectedVersion: 1,
          kind: "reply",
          content: "stale",
        },
        409,
      );
      const staffDetail = (
        await check("GET", path, "staff", undefined, 200)
      ).json();
      expect(
        staffDetail.messages.filter(
          (x: { content: string }) => x.content === note.content,
        ),
      ).toHaveLength(1);
      const customerDetail = await check(
        "GET",
        path,
        "customer",
        undefined,
        200,
      );
      expect(customerDetail.body).not.toContain(note.content);
      expect(
        customerDetail
          .json()
          .events.some(
            (event: { action: string }) => event.action === "ticket.note",
          ),
      ).toBe(false);
      expect(
        customerDetail
          .json()
          .messages.every((x: { kind: string }) => x.kind === "reply"),
      ).toBe(true);
      const eventIds = staffDetail.events.map((x: { id: string }) => x.id);
      expect(new Set(eventIds).size).toBe(eventIds.length);
      expect(
        (await call("GET", path, "staff"))
          .json()
          .events.map((x: { id: string }) => x.id),
      ).toEqual(eventIds);
      await patch({ assignedUserId: ids.otherStaff });
      await check("GET", path, "staff", undefined, 404);
      await check(
        "POST",
        `${path}/messages`,
        "staff",
        {
          requestId: randomUUID(),
          expectedVersion: ticket.version,
          kind: "note",
          content: "revoked staff",
        },
        404,
      );
      await check("GET", path, "otherStaff", undefined, 200);
      await patch({ assignedUserId: ids.staff });
      for (const status of [
        "pending",
        "in_progress",
        "waiting_for_customer",
        "resolved",
      ]) {
        await patch({ status });
        expect(ticket.status).toBe(status);
      }
      await patch({ status: "open" }, 409);
      await patch({ status: "closed" }, 409);
      await check(
        "POST",
        `${path}/close`,
        "owner",
        {
          expectedVersion: ticket.version,
          confirm: false,
          reason: "TEST reason",
        },
        400,
      );
      await check(
        "POST",
        `${path}/close`,
        "owner",
        { expectedVersion: ticket.version, confirm: true, reason: " " },
        400,
      );
      ticket = (
        await check(
          "POST",
          `${path}/close`,
          "owner",
          {
            expectedVersion: ticket.version,
            confirm: true,
            reason: "TEST issue resolved",
          },
          200,
        )
      ).json().ticket;
      expect(ticket.status).toBe("closed");
      await patch({ priority: "low" }, 409);
      await check(
        "POST",
        `${path}/messages`,
        "customer",
        {
          requestId: randomUUID(),
          expectedVersion: ticket.version,
          kind: "reply",
          content: "closed ticket write",
        },
        409,
      );
      const transcript = await check(
        "GET",
        `${path}/transcript`,
        "customer",
        undefined,
        200,
      );
      expect(transcript.headers["content-type"]).toContain("application/json");
      expect(transcript.body).not.toContain(note.content);
      expect(transcript.json().ticket.category).toBe("billing");
      expect(
        transcript
          .json()
          .events.some(
            (event: { action: string }) => event.action === "ticket.note",
          ),
      ).toBe(false);
      expect(transcript.json().ticket.closureReason).toBe(
        "TEST issue resolved",
      );
      expect(transcript.json().exportedAt).toBeTruthy();
      expect(transcript.json()).not.toHaveProperty("url");
      await check("GET", `${path}/transcript`, "otherCustomer", undefined, 404);
      expect(
        (await check("GET", `${path}/transcript`, "owner", undefined, 200))
          .body,
      ).toContain(note.content);
      ticket = (
        await check(
          "POST",
          `${path}/reopen`,
          "owner",
          { expectedVersion: ticket.version },
          200,
        )
      ).json().ticket;
      expect(ticket.status).toBe("reopened");
      await check(
        "POST",
        `${path}/reopen`,
        "owner",
        { expectedVersion: ticket.version },
        409,
      );
      ticket = (
        await check(
          "POST",
          `${path}/close`,
          "owner",
          {
            expectedVersion: ticket.version,
            confirm: true,
            reason: "TEST reclosed",
          },
          200,
        )
      ).json().ticket;
      await check(
        "PATCH",
        base,
        "owner",
        { name: tenant.name, config: { ...config, allowReopen: false } },
        200,
      );
      await check(
        "POST",
        `${path}/reopen`,
        "owner",
        { expectedVersion: ticket.version },
        409,
      );
      const guildId = "123456789012345678";
      await check(
        "PATCH",
        base,
        "owner",
        { name: tenant.name, guildId, config },
        200,
      );
      await check(
        "PATCH",
        `/support/tenants/${otherTenant.id}`,
        "outsider",
        { name: otherTenant.name, guildId, config },
        409,
      );
      await check(
        "PATCH",
        base,
        "owner",
        { name: tenant.name, guildId: "invalid", config },
        400,
      );
      for (const organisation of ["TEST link one", "TEST link two"])
        clients.push(
          (
            await pool.query(
              "INSERT INTO clients(organisation,contact_email) VALUES($1,'test@test.invalid') RETURNING id",
              [organisation],
            )
          ).rows[0].id,
        );
      const projectId = (
        await pool.query(
          "INSERT INTO projects(client_id,document) VALUES($1,'{}') RETURNING id",
          [clients[0]],
        )
      ).rows[0].id;
      await check(
        "PATCH",
        base,
        "owner",
        { name: tenant.name, clientId: clients[1], projectId, config },
        400,
      );
      await check(
        "PATCH",
        base,
        "owner",
        { name: tenant.name, clientId: clients[0], projectId, config },
        200,
      );
      const audit = await pool.query(
        "SELECT action,tenant_id FROM audit_events WHERE actor_id=ANY($1::uuid[]) AND action LIKE 'support.%'",
        [users],
      );
      expect(audit.rows.length).toBeGreaterThan(0);
      expect(
        audit.rows.every(
          (x: { tenant_id: string | null }) => x.tenant_id !== null,
        ),
      ).toBe(true);
      for (const route of ["/audit", "/activity"]) {
        const events = (
          await check("GET", route, "owner", undefined, 200)
        ).json().events;
        expect(
          events.some((x: { action: string }) =>
            x.action.startsWith("support."),
          ),
        ).toBe(false);
      }
    } finally {
      await pool.query(
        "DELETE FROM support_events WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM support_messages WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM support_tickets WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM support_members WHERE tenant_id=ANY($1::uuid[])",
        [tenants],
      );
      await pool.query(
        "DELETE FROM audit_events WHERE actor_id=ANY($1::uuid[]) OR tenant_id=ANY($2::uuid[])",
        [users, tenants],
      );
      await pool.query("DELETE FROM support_tenants WHERE id=ANY($1::uuid[])", [
        tenants,
      ]);
      await pool.query("DELETE FROM projects WHERE client_id=ANY($1::uuid[])", [
        clients,
      ]);
      await pool.query("DELETE FROM clients WHERE id=ANY($1::uuid[])", [
        clients,
      ]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
      await app.close();
      await pool.end();
    }
  });
});
