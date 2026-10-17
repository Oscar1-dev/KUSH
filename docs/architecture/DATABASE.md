# Database and persistence

PostgreSQL is authoritative. Drizzle models and SQL migrations coexist: migrations also define connection_profiles and login_attempts not currently exposed as Drizzle models. Inspect both before changing persistence.

| Table               | Stored data                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| users               | UUID, unique email, hash, admin/operator/viewer role, disabled flag, creation time |
| sessions            | SHA-256 token hash, user FK, creation/expiry times                                 |
| audit_events        | UUID, nullable actor FK, action, creation time                                     |
| login_attempts      | Hashed IP key, fixed-window start, attempt count                                   |
| connection_profiles | UUID, name, local kind, allowlisted loopback endpoint, creation time               |
| clients             | UUID, organisation/contact/notes, archive flag, positive version, timestamps       |
| projects            | UUID, client FK, JSONB delivery document, positive version, timestamps             |
| kush_migrations     | Applied migration name and timestamp                                               |

Migrations: 0001_foundation.sql, 0002_identity.sql and 0003_delivery.sql. The runner applies versioned SQL transactionally with an advisory lock and ledger. Do not reset schema or overwrite existing users silently.

Project JSON contains scope, proposal price in integer pence/revision limit/terms, staff-recorded approval evidence, dated tasks, deliverables, acceptance checks and handover. API Zod schemas bound and validate document fields; SQL additionally checks JSON is an object. Version conflicts return 409. Row locks and transactions protect workflow changes and write corresponding audit events atomically.

Logout deletes the session. Password change/reset, access changes and offline owner recovery revoke account sessions. Authentication rejects disabled users. Eight-hour sessions have creation timestamps; periodic cleanup removes expired sessions and stale login-attempt rows. Successful/failed/throttled login, identity/profile changes and relevant denied access are audited; audit action strings encode outcomes, not a separate outcome column. Delivery mutations are audited transactionally; denied delivery calls also append access-denied events.

User deletion cascades sessions and clears audit actor references. Clients are archived rather than deleted, and projects retain their client FK. Exports provide project or client-plus-project JSON with formatVersion 1. They are not a complete database backup.

The coordinator verified the automated suite against real disposable PostgreSQL and exercised persisted native delivery/export. No production or customer dataset was verified. Runtime backup/recovery instructions are maintained separately by the coordinator; keep dumps and secret files out of Git, agree retention before real customer data and rehearse restore.

References: [Drizzle migrations](https://orm.drizzle.team/docs/migrations), [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html).
