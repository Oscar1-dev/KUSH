import { isDeepStrictEqual } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "@kush/database";
import { z } from "@kush/contracts";
import {
  clientInputSchema,
  clientUpdateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  approvalSchema,
  type Client,
  type Project,
  type User,
} from "@kush/contracts";
import type { createDatabase } from "@kush/database";
interface Options {
  db: ReturnType<typeof createDatabase>["db"];
  pool: Pool;
  authenticate: (authorization: string | undefined) => Promise<User | null>;
  audit?: (actorId: string | null, action: string) => Promise<unknown>;
}
class DomainError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
type ClientRow = {
  id: string;
  organisation: string;
  contact_email: string;
  notes: string;
  archived: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
};
type ProjectRow = {
  id: string;
  client_id: string;
  document: Omit<
    Project,
    "id" | "clientId" | "version" | "createdAt" | "updatedAt"
  >;
  version: number;
  created_at: Date;
  updated_at: Date;
};
const clientView = (r: ClientRow): Client => ({
  id: r.id,
  organisation: r.organisation,
  contactEmail: r.contact_email,
  notes: r.notes,
  archived: r.archived,
  version: r.version,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const projectView = (r: ProjectRow): Project => ({
  ...r.document,
  id: r.id,
  clientId: r.client_id,
  version: r.version,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const params = z.object({ id: z.uuid() });
const definitions = (p: Project) => ({
  title: p.title,
  scope: p.scope,
  proposal: p.proposal,
  deliverables: p.deliverables.map((x) => ({ id: x.id, title: x.title })),
  acceptanceChecks: p.acceptanceChecks.map((x) => ({
    id: x.id,
    title: x.title,
  })),
});
function validateProject(previous: Project, next: Project) {
  for (const entries of [next.tasks, next.deliverables, next.acceptanceChecks])
    if (new Set(entries.map((x) => x.id)).size !== entries.length)
      throw new DomainError(400, "Checklist identifiers must be unique");
  if (
    previous.approval &&
    !isDeepStrictEqual(definitions(previous), definitions(next))
  )
    throw new DomainError(
      409,
      "Approved scope and terms are immutable; create a new project for revised terms",
    );
  const transitions: Record<Project["status"], Project["status"][]> = {
    draft: ["draft", "active", "archived"],
    active: ["active", "ready_for_handover", "archived"],
    ready_for_handover: [
      "active",
      "ready_for_handover",
      "delivered",
      "archived",
    ],
    delivered: ["delivered", "archived"],
    archived: ["archived"],
  };
  if (!transitions[previous.status].includes(next.status))
    throw new DomainError(409, "Invalid project stage transition");
  if (previous.status === "archived" || previous.status === "delivered") {
    if (!isDeepStrictEqual({ ...previous, status: next.status }, next))
      throw new DomainError(409, "Delivered or archived project is read-only");
  }
  if (
    ["active", "ready_for_handover", "delivered"].includes(next.status) &&
    !next.approval
  )
    throw new DomainError(
      409,
      "Record proposal approval before activating project",
    );
  if (["ready_for_handover", "delivered"].includes(next.status)) {
    if (
      !next.deliverables.length ||
      !next.acceptanceChecks.length ||
      [...next.deliverables, ...next.acceptanceChecks].some(
        (x) => !x.completed || !x.evidence.trim(),
      )
    )
      throw new DomainError(
        409,
        "Complete deliverables and acceptance checks with evidence first",
      );
  }
  if (
    next.status === "delivered" &&
    (!next.handover.ownership ||
      !next.handover.access ||
      !next.handover.documentation ||
      !next.handover.backup ||
      !next.handover.support ||
      !next.handover.maintenanceScope.trim() ||
      !next.handoverNotes.trim())
  )
    throw new DomainError(
      409,
      "Complete ownership, access, documentation, backup, support and maintenance handover first",
    );
}
export function registerDelivery(
  app: FastifyInstance,
  { pool, authenticate, audit }: Options,
) {
  async function identity(request: FastifyRequest, write = false) {
    const user = await authenticate(request.headers.authorization);
    if (!user) {
      await audit?.(null, "access.denied.delivery");
      throw new DomainError(401, "Authentication required");
    }
    if (write && user.role === "viewer") {
      await audit?.(user.id, "access.denied.delivery");
      throw new DomainError(403, "Staff permission required");
    }
    return user;
  }
  function route(
    method: "GET" | "POST",
    url: string,
    schema: z.ZodType | undefined,
    handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  ) {
    app.route({
      method,
      url,
      ...(schema
        ? { schema: { body: z.toJSONSchema(schema, { target: "draft-7" }) } }
        : {}),
      handler: async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        try {
          return await handler(request, reply);
        } catch (error) {
          if (error instanceof DomainError)
            return reply.code(error.status).send({ error: error.message });
          if (error instanceof z.ZodError)
            return reply.code(400).send({ error: "Invalid request" });
          throw error;
        }
      },
    });
  }
  async function transaction<T>(
    actor: string,
    action: string,
    run: (connection: PoolClient) => Promise<T>,
  ): Promise<T> {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await run(connection);
      await connection.query(
        "INSERT INTO audit_events(actor_id,action) VALUES($1,$2)",
        [actor, action],
      );
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  route("GET", "/clients", undefined, async (request) => {
    await identity(request);
    return {
      clients: (
        await pool.query<ClientRow>(
          "SELECT * FROM clients ORDER BY created_at DESC LIMIT 500",
        )
      ).rows.map(clientView),
    };
  });
  route("POST", "/clients", clientInputSchema, async (request) => {
    const user = await identity(request, true),
      data = clientInputSchema.parse(request.body);
    return transaction(user.id, "clients.create", async (c) => ({
      client: clientView(
        (
          await c.query<ClientRow>(
            "INSERT INTO clients(organisation,contact_email,notes) VALUES($1,$2,$3) RETURNING *",
            [data.organisation, data.contactEmail, data.notes],
          )
        ).rows[0]!,
      ),
    }));
  });
  route("POST", "/clients/:id", clientUpdateSchema, async (request) => {
    const user = await identity(request, true),
      { id } = params.parse(request.params),
      data = clientUpdateSchema.parse(request.body);
    return transaction(user.id, `clients.update:${id}`, async (c) => {
      const row = (
        await c.query<ClientRow>(
          "SELECT * FROM clients WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new DomainError(404, "Client not found");
      if (row.version !== data.expectedVersion)
        throw new DomainError(409, "Client changed; reload before saving");
      return {
        client: clientView(
          (
            await c.query<ClientRow>(
              "UPDATE clients SET organisation=$2,contact_email=$3,notes=$4,archived=$5,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [
                id,
                data.organisation,
                data.contactEmail,
                data.notes,
                data.archived,
              ],
            )
          ).rows[0]!,
        ),
      };
    });
  });
  route("GET", "/clients/:id/export", undefined, async (request) => {
    await identity(request);
    const { id } = params.parse(request.params);
    const row = (
      await pool.query<ClientRow>("SELECT * FROM clients WHERE id=$1", [id])
    ).rows[0];
    if (!row) throw new DomainError(404, "Client not found");
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      client: clientView(row),
      projects: (
        await pool.query<ProjectRow>(
          "SELECT * FROM projects WHERE client_id=$1 ORDER BY created_at",
          [id],
        )
      ).rows.map(projectView),
    };
  });
  route("GET", "/projects", undefined, async (request) => {
    await identity(request);
    return {
      projects: (
        await pool.query<ProjectRow>(
          "SELECT * FROM projects ORDER BY created_at DESC LIMIT 500",
        )
      ).rows.map(projectView),
    };
  });
  route("POST", "/projects", projectCreateSchema, async (request) => {
    const user = await identity(request, true),
      data = projectCreateSchema.parse(request.body);
    return transaction(user.id, "projects.create", async (c) => {
      const client = (
        await c.query<ClientRow>(
          "SELECT * FROM clients WHERE id=$1 FOR SHARE",
          [data.clientId],
        )
      ).rows[0];
      if (!client) throw new DomainError(404, "Client not found");
      if (client.archived) throw new DomainError(409, "Client is archived");
      const document = {
        title: data.title,
        scope: data.scope,
        status: "draft",
        proposal: null,
        approval: null,
        tasks: [],
        deliverables: [],
        acceptanceChecks: [],
        handover: {
          ownership: false,
          access: false,
          documentation: false,
          backup: false,
          support: false,
          maintenanceScope: "",
        },
        handoverNotes: "",
      };
      return {
        project: projectView(
          (
            await c.query<ProjectRow>(
              "INSERT INTO projects(client_id,document) VALUES($1,$2) RETURNING *",
              [data.clientId, document],
            )
          ).rows[0]!,
        ),
      };
    });
  });
  for (const suffix of ["", "/export"])
    route("GET", `/projects/:id${suffix}`, undefined, async (request) => {
      await identity(request);
      const { id } = params.parse(request.params);
      const row = (
        await pool.query<ProjectRow>("SELECT * FROM projects WHERE id=$1", [id])
      ).rows[0];
      if (!row) throw new DomainError(404, "Project not found");
      return {
        project: projectView(row),
        ...(suffix
          ? { formatVersion: 1, exportedAt: new Date().toISOString() }
          : {}),
      };
    });
  route("POST", "/projects/:id", projectUpdateSchema, async (request) => {
    const user = await identity(request, true),
      { id } = params.parse(request.params),
      { expectedVersion, ...data } = projectUpdateSchema.parse(request.body);
    return transaction(user.id, `projects.update:${id}`, async (c) => {
      const row = (
        await c.query<ProjectRow>(
          "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new DomainError(404, "Project not found");
      if (row.version !== expectedVersion)
        throw new DomainError(409, "Project changed; reload before saving");
      const previous = projectView(row),
        next = { ...previous, ...data };
      validateProject(previous, next);
      const document = { ...row.document, ...data };
      return {
        project: projectView(
          (
            await c.query<ProjectRow>(
              "UPDATE projects SET document=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [id, document],
            )
          ).rows[0]!,
        ),
      };
    });
  });
  route("POST", "/projects/:id/approve", approvalSchema, async (request) => {
    const user = await identity(request, true),
      { id } = params.parse(request.params),
      data = approvalSchema.parse(request.body);
    return transaction(
      user.id,
      `projects.approval_recorded:${id}`,
      async (c) => {
        const row = (
          await c.query<ProjectRow>(
            "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!row) throw new DomainError(404, "Project not found");
        if (row.version !== data.expectedVersion)
          throw new DomainError(409, "Project changed; reload before saving");
        if (row.document.approval || row.document.status !== "draft")
          throw new DomainError(
            409,
            "Approval already recorded or project is not draft",
          );
        if (
          !row.document.proposal ||
          !row.document.deliverables.length ||
          !row.document.acceptanceChecks.length
        )
          throw new DomainError(
            409,
            "Set proposal, deliverables and acceptance criteria before approval",
          );
        const document = {
          ...row.document,
          approval: {
            approvedBy: data.approvedBy,
            approvalEvidence: data.approvalEvidence,
            approvedAt: new Date().toISOString(),
            recordedBy: user.id,
          },
        };
        return {
          project: projectView(
            (
              await c.query<ProjectRow>(
                "UPDATE projects SET document=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
                [id, document],
              )
            ).rows[0]!,
          ),
        };
      },
    );
  });
}

export const deliveryOpenApiPaths = Object.fromEntries(
  [
    ["/clients", "get", undefined],
    ["/clients", "post", clientInputSchema],
    ["/clients/{id}", "post", clientUpdateSchema],
    ["/clients/{id}/export", "get", undefined],
    ["/projects", "get", undefined],
    ["/projects", "post", projectCreateSchema],
    ["/projects/{id}", "get", undefined],
    ["/projects/{id}", "post", projectUpdateSchema],
    ["/projects/{id}/approve", "post", approvalSchema],
    ["/projects/{id}/export", "get", undefined],
  ].reduce<[string, Record<string, unknown>][]>(
    (entries, [path, method, schema]) => {
      const name = path as string;
      const existing = entries.find(([key]) => key === name);
      const methods = existing?.[1] ?? {};
      methods[method as string] = {
        security: [{ bearerAuth: [] }],
        ...(name.includes("{id}")
          ? {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string", format: "uuid" },
                },
              ],
            }
          : {}),
        ...(schema
          ? {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: z.toJSONSchema(schema as z.ZodType, {
                      target: "draft-7",
                    }),
                  },
                },
              },
            }
          : {}),
        responses: {
          "200": { description: "Persisted client/project result" },
          "400": { description: "Invalid request" },
          "401": { description: "Authentication required" },
          "403": { description: "Staff permission required for writes" },
          "404": { description: "Record not found" },
          "409": { description: "Version conflict or unmet workflow gate" },
        },
      };
      if (!existing) entries.push([name, methods]);
      return entries;
    },
    [],
  ),
);
