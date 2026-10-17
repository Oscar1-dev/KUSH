# M3 first-slice acceptance

Target: create ticket → persist → retrieve → update → close with reason and confirmation → export JSON, using real PostgreSQL, backend endpoints and the existing desktop.

## Executable local checks

`services/api/test/support.test.ts` uses `KUSH_TEST_DATABASE_URL`, real migrations and real database state. It injects authenticated sessions to avoid coupling support assertions to login throttling. With no database URL it explicitly skips; a skipped test is not PostgreSQL evidence. Use the coordinated `pnpm local test` disposable database runner; do not point tests at a customer's database.

Coverage includes tenant and customer isolation; global administrator without membership; global customer business-route denial; enabled same-tenant staff assignment; unassigned and reassigned staff access; global viewer escalation denial; public versus internal message visibility; stable event IDs; duplicate creation/message replay and mismatched payload conflict; stale versions; close/reopen gates; JSON transcript privacy; guild format/uniqueness; matching client/project relationships; tenant audit scope and exclusion from root audit/activity.

Fixtures use unique generated IDs and delete only their own tenant/user/client records. Real test execution, totals and failures must be recorded in STATUS.md by the integrating lead. This file defines acceptance and does not claim execution by itself.

Additional review regressions assert that tenant membership/email rosters are owner-only; staff-created tickets are assigned to their creator; reassignment prevents the former staff creator from retrieving ticket metadata by replaying creation; and the original customer creation request remains idempotent after a category edit while a changed original payload conflicts. Customer exports after category changes must still omit internal notes and staff-only events.

## Desktop acceptance

Run the actual Windows app against the real local API/database. Inspect loading, empty and error states, tenant selection, list/detail, assignment, reply/note, state and priority updates, confirmation and reason, reopen policy, and exported JSON. Confirm internal notes never appear for a customer. Check keyboard access, labels and actual screenshots. Record native evidence separately from browser/unit tests.

## Explicitly pending

No Discord runtime, gateway connection, token handling, slash command, channel permission overwrite, message synchronisation, bot health heartbeat or server application is verified in this slice. Mocked bot tests are deferred until there is an adapter to test. Existing permission matrix and blueprint documents are design proposals, not a tested evaluator or reconciliation engine. Live Discord checks require the owner's explicit authorisation and actual access. Retention enforcement, deletion controls, safe HTML exports and production hosting remain subsequent work.
