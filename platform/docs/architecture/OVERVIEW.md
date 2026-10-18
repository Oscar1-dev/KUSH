# Platform architecture

KUSH Developer is a native Windows Tauri 2/React client of the loopback Fastify API on port 4310. PostgreSQL is authoritative. The client never accesses the database directly; all permissions and delivery workflow gates are enforced by the API.

```text
React / Tauri → HTTP loopback :4310 → Fastify modular monolith → PostgreSQL
```

Implemented domains: identity, local connection profiles, audit/activity and a narrow client/project service-delivery slice. Identity includes account administration, password change/reset, session revocation, login throttling and explicit offline owner recovery. Delivery includes proposals, recorded approval evidence, tasks, deliverables, acceptance checks, handover and JSON export.

Connection profiles are real PostgreSQL records restricted to the two local HTTP endpoints on port 4310. They are not SSH profiles or remote deployment targets. Session tokens stay in client memory. Stopping the API/database produces an unavailable state.

The coordinator verified 13 tests (6 desktop and 7 API) using real disposable PostgreSQL, native desktop delivery through export, offline recovery denial/success, native minimise/maximise/restore queries and a signed-in axe scan with zero violations. These checks establish the exercised slice; full M2 and the physical native accessibility/window matrix remain unfinished. Exact evidence and current limitations belong in ../roadmap/STATUS.md.

Workers will be independent of the desktop when persistent business work requires them. Redis, bot, website, marketplace, SSH and external commerce remain planned. No customer demand or live integration is established by local verification.

References: [Fastify](https://fastify.dev/docs/latest/), [Tauri 2](https://v2.tauri.app/), [PostgreSQL](https://www.postgresql.org/docs/current/), [Drizzle](https://orm.drizzle.team/docs/overview), [pnpm](https://pnpm.io/workspaces), [Turborepo](https://turborepo.com/docs).
