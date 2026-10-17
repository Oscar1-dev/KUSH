import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@kush/contracts";
import { hashPassword, verifyPassword } from "./password.js";
import type { DatabaseContext } from "./security.js";
interface Context extends DatabaseContext {
  authenticate: (authorization: string | undefined) => Promise<User | null>;
  audit: (actorId: string | null, action: string) => Promise<void>;
}
const passwordProperty = { type: "string", minLength: 14, maxLength: 1024 };
const uuidParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
  additionalProperties: false,
};
export async function registerIdentity(
  app: FastifyInstance,
  { pool, authenticate, audit }: Context,
) {
  const guard = async (
    request: FastifyRequest,
    reply: FastifyReply,
    admin = false,
  ) => {
    const user = await authenticate(request.headers.authorization);
    if (!user) {
      await audit(null, "access.denied");
      reply.code(401).send({ error: "Authentication required" });
      return null;
    }
    if (admin && user.role !== "admin") {
      await audit(user.id, "access.denied");
      reply.code(403).send({ error: "Administrator permission required" });
      return null;
    }
    return user;
  };
  app.get("/admin/users", async (request, reply) => {
    if (!(await guard(request, reply, true))) return;
    const result = await pool.query(
      `SELECT id,email,role,disabled,created_at AS "createdAt" FROM users WHERE kind='account' ORDER BY created_at,id`,
    );
    return { users: result.rows };
  });
  app.post<{ Body: { email: string; password: string; role: string } }>(
    "/admin/users",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "role"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email", maxLength: 254 },
            password: passwordProperty,
            role: {
              type: "string",
              enum: ["admin", "operator", "viewer", "customer"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await guard(request, reply, true);
      if (!user) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          'INSERT INTO users(email,password_hash,role) VALUES ($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id,email,role,disabled,created_at AS "createdAt"',
          [
            request.body.email.trim().toLowerCase(),
            await hashPassword(request.body.password),
            request.body.role,
          ],
        );
        if (!result.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(409).send({ error: "Email already exists" });
        }
        await client.query(
          "INSERT INTO audit_events(actor_id,action) VALUES ($1,'admin.user.created')",
          [user.id],
        );
        await client.query("COMMIT");
        return reply.code(201).send({ user: result.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.post<{
    Params: { id: string };
    Body: { role: string; disabled: boolean };
  }>(
    "/admin/users/:id/access",
    {
      schema: {
        params: uuidParams,
        body: {
          type: "object",
          required: ["role", "disabled"],
          additionalProperties: false,
          properties: {
            role: {
              type: "string",
              enum: ["admin", "operator", "viewer", "customer"],
            },
            disabled: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await guard(request, reply, true);
      if (!user) return;
      if (
        user.id === request.params.id &&
        (request.body.disabled || request.body.role !== "admin")
      )
        return reply.code(409).send({
          error: "Cannot disable or demote your own administrator account",
        });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(4310002)");
        const actor = await client.query(
          "SELECT id FROM users WHERE id=$1 AND role='admin' AND disabled=false",
          [user.id],
        );
        if (!actor.rowCount) {
          await client.query("ROLLBACK");
          return reply
            .code(403)
            .send({ error: "Administrator permission required" });
        }
        const target = await client.query(
          "SELECT role,disabled FROM users WHERE id=$1 FOR UPDATE",
          [request.params.id],
        );
        if (!target.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "User not found" });
        }
        if (
          target.rows[0].role === "admin" &&
          !target.rows[0].disabled &&
          (request.body.disabled || request.body.role !== "admin")
        ) {
          const count = await client.query(
            "SELECT count(*)::integer AS count FROM users WHERE role='admin' AND disabled=false",
          );
          if (count.rows[0].count <= 1) {
            await client.query("ROLLBACK");
            return reply
              .code(409)
              .send({ error: "Keep at least one enabled administrator" });
          }
        }
        await client.query("UPDATE users SET role=$2,disabled=$3 WHERE id=$1", [
          request.params.id,
          request.body.role,
          request.body.disabled,
        ]);
        await client.query("DELETE FROM sessions WHERE user_id=$1", [
          request.params.id,
        ]);
        await client.query(
          "INSERT INTO audit_events(actor_id,action) VALUES ($1,'admin.user.access_changed')",
          [user.id],
        );
        await client.query("COMMIT");
        return reply.code(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.post<{ Params: { id: string }; Body: { password: string } }>(
    "/admin/users/:id/password",
    {
      schema: {
        params: uuidParams,
        body: {
          type: "object",
          required: ["password"],
          additionalProperties: false,
          properties: { password: passwordProperty },
        },
      },
    },
    async (request, reply) => {
      const user = await guard(request, reply, true);
      if (!user) return;
      if (user.id === request.params.id)
        return reply
          .code(409)
          .send({ error: "Use your account password change form" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "UPDATE users SET password_hash=$2 WHERE id=$1 RETURNING id",
          [request.params.id, await hashPassword(request.body.password)],
        );
        if (!result.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "User not found" });
        }
        await client.query("DELETE FROM sessions WHERE user_id=$1", [
          request.params.id,
        ]);
        await client.query(
          "INSERT INTO audit_events(actor_id,action) VALUES ($1,'admin.user.password_reset')",
          [user.id],
        );
        await client.query("COMMIT");
        return reply.code(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.post<{ Body: { currentPassword: string; password: string } }>(
    "/auth/password",
    {
      schema: {
        body: {
          type: "object",
          required: ["currentPassword", "password"],
          additionalProperties: false,
          properties: {
            currentPassword: { type: "string", minLength: 1, maxLength: 1024 },
            password: passwordProperty,
          },
        },
      },
    },
    async (request, reply) => {
      const user = await guard(request, reply);
      if (!user) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
          [user.id],
        );
        if (
          !result.rowCount ||
          !(await verifyPassword(
            request.body.currentPassword,
            result.rows[0].password_hash,
          ))
        ) {
          await client.query("ROLLBACK");
          await audit(user.id, "auth.password.denied");
          return reply
            .code(403)
            .send({ error: "Current password is incorrect" });
        }
        await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          user.id,
          await hashPassword(request.body.password),
        ]);
        await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
        await client.query(
          "INSERT INTO audit_events(actor_id,action) VALUES ($1,'auth.password.changed')",
          [user.id],
        );
        await client.query("COMMIT");
        return reply.code(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.get("/activity", async (request, reply) => {
    const user = await guard(request, reply);
    if (!user) return;
    const result = await pool.query(
      'SELECT id,action,created_at AS "createdAt" FROM audit_events WHERE tenant_id IS NULL AND actor_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',
      [user.id],
    );
    return { events: result.rows };
  });
  app.get("/profiles", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const result = await pool.query(
      'SELECT id,name,kind,endpoint,created_at AS "createdAt" FROM connection_profiles ORDER BY created_at,id',
    );
    return { profiles: result.rows };
  });
  app.post<{ Body: { name: string; endpoint: string } }>(
    "/profiles",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "endpoint"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "\\S",
            },
            endpoint: {
              type: "string",
              enum: ["http://127.0.0.1:4310", "http://localhost:4310"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await guard(request, reply, true);
      if (!user) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          'INSERT INTO connection_profiles(name,endpoint) VALUES($1,$2) RETURNING id,name,kind,endpoint,created_at AS "createdAt"',
          [request.body.name.trim(), request.body.endpoint],
        );
        await client.query(
          "INSERT INTO audit_events(actor_id,action) VALUES($1,'profile.created')",
          [user.id],
        );
        await client.query("COMMIT");
        return reply.code(201).send({ profile: result.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    "/profiles/:id/delete",
    { schema: { params: uuidParams } },
    async (request, reply) => {
      const user = await guard(request, reply, true);
      if (!user) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "DELETE FROM connection_profiles WHERE id=$1",
          [request.params.id],
        );
        if (!result.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "Profile not found" });
        }
        await client.query(
          "INSERT INTO audit_events(actor_id,action) VALUES($1,'profile.deleted')",
          [user.id],
        );
        await client.query("COMMIT");
        return reply.code(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
