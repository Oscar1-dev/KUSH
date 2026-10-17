import { describe, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { createDatabase } from "@kush/database";
import type { Project } from "@kush/contracts";
import { buildApp } from "../src/app.js";
import { hashPassword, tokenHash } from "../src/password.js";
const url = process.env.KUSH_TEST_DATABASE_URL;
describe.skipIf(!url)("persisted delivery workflow", () => {
  it("gates approval, acceptance and ownership; prevents stale writes and viewer mutations", async () => {
    const { pool } = createDatabase(url!);
    const app = await buildApp(url!);
    const ids: string[] = [];
    let clientId: string | undefined;
    try {
      const passwordHash = await hashPassword("delivery-test-only-password");
      const headers: Record<string, { authorization: string }> = {};
      for (const role of ["operator", "viewer"]) {
        const user = (
          await pool.query<{ id: string }>(
            "INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id",
            [`${randomUUID()}@test.invalid`, passwordHash, role],
          )
        ).rows[0]!;
        ids.push(user.id);
        const token = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [tokenHash(token), user.id],
        );
        headers[role] = { authorization: `Bearer ${token}` };
      }
      const send = async (path: string, payload: object, role = "operator") =>
        app.inject({
          method: "POST",
          url: path,
          headers: headers[role],
          payload,
        });
      expect(
        (
          await send("/clients", {
            organisation: "",
            contactEmail: "bad",
            notes: "",
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await send("/clients", {
            organisation: "x".repeat(161),
            contactEmail: "a@test.invalid",
            notes: "",
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await send(
            "/clients",
            {
              organisation: "Example",
              contactEmail: "a@test.invalid",
              notes: "",
            },
            "viewer",
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await pool.query(
            "SELECT count(*) AS n FROM audit_events WHERE action='access.denied.delivery'",
          )
        ).rows[0].n,
      ).not.toBe("0");
      const clientResponse = await send("/clients", {
        organisation: "SQL ' ; DROP TABLE projects; --",
        contactEmail: "owner@test.invalid",
        notes: "Test-only fixture",
      });
      expect(clientResponse.statusCode).toBe(200);
      const client = clientResponse.json().client;
      clientId = client.id;
      expect(
        (
          await send(`/clients/${client.id}`, {
            organisation: client.organisation,
            contactEmail: client.contactEmail,
            notes: "",
            archived: false,
            expectedVersion: 999,
          })
        ).statusCode,
      ).toBe(409);
      const created = await send("/projects", {
        clientId: client.id,
        title: "Support setup",
        scope: "Private ticket workflow",
      });
      expect(created.statusCode).toBe(200);
      let project: Project = created.json().project;
      expect(
        (await app.inject({ url: `/projects/${project.id}` })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            url: `/projects/${project.id}`,
            headers: headers.viewer,
          })
        ).statusCode,
      ).toBe(200);
      expect(client.organisation).toBe("SQL ' ; DROP TABLE projects; --");
      const update = async (changes: Partial<Project>, expected = 200) => {
        const version = project.version;
        const document = {
          title: project.title,
          scope: project.scope,
          status: project.status,
          proposal: project.proposal,
          tasks: project.tasks,
          deliverables: project.deliverables,
          acceptanceChecks: project.acceptanceChecks,
          handover: project.handover,
          handoverNotes: project.handoverNotes,
        };
        const result = await send(`/projects/${project.id}`, {
          ...document,
          ...changes,
          expectedVersion: version,
        });
        expect(result.statusCode, result.body).toBe(expected);
        if (expected === 200) project = result.json().project;
        return result;
      };
      const staleDocument = {
        expectedVersion: 999,
        title: project.title,
        scope: project.scope,
        status: project.status,
        proposal: project.proposal,
        tasks: project.tasks,
        deliverables: project.deliverables,
        acceptanceChecks: project.acceptanceChecks,
        handover: project.handover,
        handoverNotes: project.handoverNotes,
      };
      expect(
        (await send(`/projects/${project.id}`, staleDocument)).statusCode,
      ).toBe(409);
      expect(
        (
          await send(`/projects/${project.id}`, {
            ...staleDocument,
            expectedVersion: project.version,
            tasks: Array.from({ length: 101 }, () => ({
              id: randomUUID(),
              title: "Too many",
              notes: "",
              dueDate: null,
              completed: false,
            })),
          })
        ).statusCode,
      ).toBe(400);
      await update({ status: "delivered" }, 409);
      await update({ status: "active" }, 409);
      const check = (title: string) => ({
        id: randomUUID(),
        title,
        completed: false,
        evidence: "",
      });
      await update({
        proposal: {
          pricePence: 20000,
          revisionLimit: 1,
          terms: "One setup and handover",
        },
        deliverables: [check("Private tickets")],
        acceptanceChecks: [check("Viewer cannot read private ticket")],
        tasks: [
          {
            id: randomUUID(),
            title: "Configure",
            notes: "Test permissions",
            dueDate: "2026-10-20",
            completed: false,
          },
        ],
      });
      const approval = await send(`/projects/${project.id}/approve`, {
        expectedVersion: project.version,
        approvedBy: "Pilot owner",
        approvalEvidence: "Written approval referenced in test fixture",
      });
      expect(approval.statusCode, approval.body).toBe(200);
      project = approval.json().project;
      await update({ scope: "Changed after approval" }, 409);
      await update({ status: "active" });
      await update({ status: "ready_for_handover" }, 409);
      await update({
        deliverables: project.deliverables.map((x) => ({
          ...x,
          completed: true,
          evidence: "Private channel verified",
        })),
        acceptanceChecks: project.acceptanceChecks.map((x) => ({
          ...x,
          completed: true,
          evidence: "Viewer request denied",
        })),
        status: "ready_for_handover",
      });
      await update({ status: "delivered" }, 409);
      await update({
        handover: {
          ownership: true,
          access: true,
          documentation: true,
          backup: true,
          support: true,
          maintenanceScope:
            "No ongoing maintenance; separate agreement required",
        },
        handoverNotes: "Owner received access and recovery documentation",
        status: "delivered",
      });
      const reloaded = await app.inject({
        url: `/projects/${project.id}`,
        headers: headers.operator,
      });
      expect(reloaded.json().project).toEqual(project);
      const exported = await app.inject({
        url: `/clients/${client.id}/export`,
        headers: headers.viewer,
      });
      expect(exported.json().projects[0].approval.approvedBy).toBe(
        "Pilot owner",
      );
      await update({ handoverNotes: "overwrite delivered" }, 409);
      await update({ status: "archived" });
      const audit = await pool.query(
        "SELECT action FROM audit_events WHERE actor_id=$1",
        [ids[0]],
      );
      expect(
        audit.rows.some((x: { action: string }) =>
          x.action.startsWith("projects.approval_recorded:"),
        ),
      ).toBe(true);
      expect(
        (
          await app.inject({
            url: `/projects/${randomUUID()}`,
            headers: headers.operator,
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      if (clientId) {
        await pool.query("DELETE FROM projects WHERE client_id=$1", [clientId]);
        await pool.query("DELETE FROM clients WHERE id=$1", [clientId]);
      }
      for (const id of ids) {
        await pool.query("DELETE FROM audit_events WHERE actor_id=$1", [id]);
        await pool.query("DELETE FROM users WHERE id=$1", [id]);
      }
      await app.close();
      await pool.end();
    }
  });
});
