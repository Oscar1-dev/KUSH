# KUSH status — 16 October 2026

## Current milestone

M3 local support ticket functionality is now implemented; see the M3 evidence below. M0 remains implemented. The remaining local M1 functionality and a complete M2 client-to-delivery vertical slice are implemented and verified. Hardware-specific window/accessibility qualification remains unverified; full M2 and the later roadmap are not declared complete.

## Implemented

- M1 account administration: create staff accounts, change roles, disable accounts, reset passwords, change own password, and explicitly recover an existing account offline with database-owner access. Last enabled administrator and self-demotion protections apply. Password/access changes revoke sessions.
- Backend-authoritative permissions, disabled-account checks, periodic expired-session cleanup, successful/failed/throttled login audit and denied-access audit including delivery routes. Login throttling persists in PostgreSQL across API restarts; global request limits remain process-local.
- Named persistent non-secret local connection profiles and validated selection between localhost/127.0.0.1 on port4310; health, activity and administrator audit views. These are development API profiles, not SSH/provider integrations.
- Central frontend401 handling clears the in-memory session and cached business data. Non-secret polling and endpoint preferences persist. Tokens and passwords are not saved in browser storage.
- M2 clients: organisation, contact email, notes, editing/archive, version conflict checks and JSON export.
- M2 projects: linked client, scoped work, integer-pence price, revision allowance, commercial/ownership terms, recorded approval evidence, tasks/notes/due dates, deliverables, acceptance evidence, handover checklist/maintenance boundaries, explicit stages, archive and JSON export.
- Backend delivery gates: approval before activation; completed deliverables and acceptance evidence before ready; ownership/access/documentation/backup/support, maintenance scope and handover notes before delivered. Approved commercial/checklist definitions are immutable. Delivered/archived records are read-only except explicit delivered-to-archived transition. Changing approved terms requires a new project in this slice.
- Transactional business mutation audit and optimistic concurrency. Uncontrolled client/admin forms remount when server version/access state changes to prevent stale field values being submitted against refreshed versions.
- Additive migrations0002/0003 and a checksum-enforced transactional migration runner. OpenAPI includes current registered routes and required path parameters.
- Project-local PostgreSQL lifecycle now uses pg_ctl for orderly shutdown. Test and native-test commands use fresh disposable UTF8 databases. A lock prevents simultaneous local runners. No system database service or paid infrastructure was installed.
- Encrypted, schema-checked application snapshots and restore only into a new database. Users, profiles, clients, projects and audit are preserved; sessions and login-attempt counters are excluded. Backup format is intentionally application-specific, not a general PostgreSQL dump. See ../security/RECOVERY.md.
- The legacy Windows-1252 development database was copied into a verified UTF8 database; the original was retained unchanged. The configured application now uses the UTF8 copy. New test/restore databases and new clusters explicitly use UTF8.

## Verified

- M2 baseline pnpm local test:13 tests passed, comprising6 desktop boundary/configuration tests and7 API tests. Real disposable PostgreSQL exercised auth lifecycle, administration/disabled accounts, password revocation, throttle persistence, cleanup, profile bounds, delivery gates, viewer denial, invalid input, stale versions, immutable approval, exports and explicit offline recovery confirmation rejection/success. OpenAPI dynamic path parameter coverage is asserted.
- pnpm local native-test: actual final Windows executable, real temporary API and real PostgreSQL passed window minimise/maximise/restore state queries, staff creation/access/disable/reset, own password change and fresh login, profile creation/selection, Unicode client text, scoped project/proposal/recorded TEST approval, tasks, completion evidence, ready/handover/delivered gates, real downloaded JSON export, expired-session auto-signout and preference persistence.
- The native test verifies read-only delivered controls, no unexpected page errors and no credential/browser-storage persistence. Test approval/evidence is explicitly labelled; no actual customer approval, Discord check or commercial delivery is claimed.
- Signed-in axe scan: zero WCAG2 A/AA and WCAG2.1 AA violations on the exercised app state. Native screenshots were captured and inspected at test-results/native-delivery.png and native-signed-out.png; exported JSON was read and checked. Native geometry sample:1024x800 physical pixels, scale1, with actual OS state changes verified.
- pnpm local recovery-check: nonempty users/profiles/clients/projects/audit copied with identical content digest; Unicode/newlines preserved; wrong passphrase and existing destination rejected; sessions excluded; source unchanged. Only rehearsal-created databases/files are removed.
- Native release build with --no-bundle, frontend production build, package type checks, ESLint, formatting and dependency advisory audit pass at final verification. No known advisories reported; no installer/signing or public-production certification is implied.
- Explicit local runner stop command tested: API/database stop and pg_ctl reports clean shutdown. Test runner/API/database/WebView debugging ports are closed after verification.

## Incomplete and blocked

- Physical multi-monitor/DPI changes, Windows snapping, manual drag/resize edge cases, full keyboard/screen-reader and assistive-technology matrix remain unverified. This is the remaining platform qualification gap; no credentials or spending can resolve it automatically in this session.
- Full M2 still needs reusable service/scope templates, separate milestone and communication records, attachments/file upload/storage policies and approved change-order/revision history. Current linked client/project/proposal/handover workflow is complete within its stated scope.
- The original KUSH logo has not been attached; neutral technical icon and basic functional styling remain. Advanced visual work is deferred.
- The Discord adapter and remaining M3 features remain planned. No Discord, SSH, Stripe, supplier, licensing, website or marketplace integration is claimed. No customer interviews, sales or live customer records have been invented.
- Production TLS/deployment, MFA, public account recovery, comprehensive operational monitoring and scheduled off-device backups remain future production work. Local database credentials are protected by current-user Windows ACL, not encrypted against the signed-in owner. Backup passphrases must be kept separately.

## Budget and preservation

£0 spent. No paid hosting, domains, subscriptions or API services added. Existing portfolio/Veyrix files and code were preserved. No remote, commit, publication, customer charge or live external system change was made. The independently initialised KUSH repository still has uncommitted source from its foundation.

## Next

Use the working delivery workflow for an explicitly agreed pilot and validate the service offer. Complete the remaining hardware/manual qualification and choose the next M2 extension based on actual delivery needs alongside the next M3 Discord adapter slice. Do not claim full M2 or live integrations complete.

## M3 local support slice — 16 October 2026

Implemented: tenant-scoped support workspaces, owner-managed membership, customer application accounts, ticket lifecycle, assignment, categories, priority, public replies, private notes, explicit close/reopen and JSON transcripts in the existing desktop/API/PostgreSQL stack. Global administrators have no tenant access bypass. Staff access is assignment-scoped. Customer business routes and private note/event exports are denied. Additive migrations 0004/0005 preserve ticket creation payloads independently of later category edits. PATCH/DELETE CORS methods support native mutations.

Verified: pnpm local test passed all17 tests (9 desktop and8 API), including real PostgreSQL lifecycle, tenant boundaries, roster privacy, assignment/reassignment, idempotency after category changes, optimistic concurrency and customer transcript privacy. Package type checks, ESLint, formatting and production dependency advisory audit pass. Encrypted recovery rehearsal passed with nonempty support tenants/members/tickets/messages/events as well as existing business records; matching digest, Unicode, wrong-passphrase rejection, source preservation and session exclusion were checked.

Incomplete: Discord bot adapter/runtime, credentials, gateway, guild reconciliation, permission evaluation, slash commands, message synchronisation, retention enforcement and live-server verification. No live Discord changes or paid services were used. Native M3 verification is recorded below.

Native M3 verification passed against the rebuilt Windows release executable, temporary real API and disposable PostgreSQL: workspace/ticket create and retrieve; Unicode persistence; status/priority update; public reply and private note separation; close with reason/confirmation; downloaded and parsed JSON transcript; reopen; zero WCAG2 A/AA and WCAG2.1 AA axe violations in exercised states; session expiry sign-out and preference persistence. The extended test pauses between M2 and M3 suites to respect the unchanged 100-request/minute production API limit. Evidence: test-results/native-support.png and native-support-transcript.json. Test fixtures were cleaned and the API/database stopped gracefully.

## Discord Slice A — blueprint v2, permission evaluator, drift fix — 17 October 2026

Implemented (apps/discord-bot):

- Effective-permission evaluator (`src/permissions.ts`): owner/Administrator bypass, the @everyone → role union → member overwrite order, timeout, and implicit ViewChannel/SendMessages/Connect rules.
- Blueprint v2 (`src/blueprint.ts`):
  - The requested role hierarchy, Owner → … → Restricted.
  - A consolidated INFORMATION/COMMUNITY/STUDIO/PRODUCTS/SUPPORT/PARTNERSHIPS/STAFF/OWNER layout, plus private TICKETS/REPORTS containers and per-ticket overwrites.
  - Only Owner holds Administrator.
  - Restriction strips roles, because Discord lets another role's allow beat a Restricted deny.
- Planner v2 (`src/provisioning.ts`):
  - Fails closed on unresolved principals. This is the regression fix: the v1 planner reported "no drift" whenever roles or the @everyone ID were unresolved, and the CLI never supplied the @everyone ID.
  - Resolves roles against the full blueprint.
  - Adopts v1 IDs via legacy keys.
  - Reports hierarchy and bot-authority conflicts as owner actions.
  - Flags exposure of managed and unmanaged channels.
  - Never deletes.
- Adapter-based apply engine (partial-failure mapping), discord.js adapter, and CLI `inspect` (live read-only), `setup --dry-run`, and `setup --apply` (gated by guild confirmation and the reviewed plan hash).
- Generated docs/discord/PERMISSION-MATRIX.md (a test fails if it drifts); rewritten PERMISSIONS.md and SERVER-BLUEPRINT.md.

Verified locally:

- `@kush/discord-bot`: 59 tests passed, including regression tests that failed before the fix.
- Role-combination matrix tests, ticket isolation tests, and a fake-guild apply after which a second plan has zero operations.
- Repo `pnpm lint`, `pnpm typecheck`, `pnpm build` and `prettier --check .` pass.
- `pnpm test`: desktop 9 passed; API 2 passed and 7 skipped, because no `KUSH_TEST_DATABASE_URL` was set (API untouched in this slice).

Not verified: nothing was run against Discord. The discord.js adapter has never been executed live.

Live state risk: on 17 October `.local/apply-discord.mjs` applied v1 to guild 1560640601676845146. It wrote empty overwrites on all categories and on the staff/management channels, which are probably visible to all members. This needs a read-only `discord:inspect` and an owner-approved v2 apply.

Next:

- Slice B: bot runtime — `!` prefix router (Message Content intent), rate limiting, health, restart recovery.
- Slice C: private ticket channels backed by PostgreSQL.
