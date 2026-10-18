# KUSH

Private local-first operations software for KUSH. The Windows client connects to a real Fastify API and PostgreSQL. M1 local functionality and a complete client/project delivery slice work; the first M3 local support ticket slice is implemented. The full M2/M3 roadmaps and external integrations remain unfinished. See docs/roadmap/STATUS.md for evidence and limitations.

## Start

Tested: Windows 11, Node 24.19.0, pnpm 12.9.1, Rust/Cargo 1.98.1, MSVC Build Tools and Edge WebView2. Native prerequisites: https://v2.tauri.app/start/prerequisites/ . Free local tools only; no subscription or credit card needed.

```powershell
pnpm install --frozen-lockfile
pnpm local api
```

This starts project-local PostgreSQL on 127.0.0.1:54329, applies additive migrations and starts the API on 127.0.0.1:4310. Generated credentials and data are under ignored, Windows current-user-protected .local/. No default application password exists. Type stop and press Enter in the API terminal for an orderly shutdown. Keep only one local runner active.

In another terminal:

```powershell
pnpm dev:desktop
```

To build the executable: pnpm --filter @kush/developer tauri build --no-bundle. It is written to apps/developer/src-tauri/target/release/kush-developer.exe. The API/database operate separately from the desktop. No installer/signing or production deployment is included.

The pinned embedded-postgres package supplies local binaries; the runtime uses pg_ctl to start/stop them. Docker Compose is an alternative under infra/docker and has not been executed here. This is local infrastructure, not production uptime.

## First administrator

Stop the API runner first. Use your own credentials, keeping the password out of shell history:

```powershell
$env:KUSH_ADMIN_EMAIL = Read-Host 'Administrator email'
$kushAdminSecret = Read-Host 'Password (at least 14 characters)' -AsSecureString
$env:KUSH_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $kushAdminSecret).Password
try { pnpm local bootstrap }
finally {
  Remove-Item Env:KUSH_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable kushAdminSecret -ErrorAction SilentlyContinue
}
pnpm local api
```

Bootstrap refuses duplicate email addresses. Test accounts are removed by verification. For an existing account you cannot access, follow docs/security/RECOVERY.md; recovery requires explicit local database-owner confirmation. Password changes and administrator access changes revoke sessions.

## Use the delivery workflow

1. Sign in as an administrator or operator. Viewers can read/export, but cannot change business records.
2. Create a client, then a linked project. Save scope, price in GBP pence, included revisions, ownership/payment/service terms, deliverables and acceptance-check definitions.
3. Record client approval only after receiving it; include who approved and evidence. This is an internal record, not an electronic signature. Approved definitions become immutable; changed terms require a new project in this slice.
4. Activate the project. Complete tasks, deliverables and acceptance evidence, then mark ready for handover.
5. Record ownership/access/documentation/backup/support handover, maintenance scope and notes. Only then can the server accept delivered status. Delivered records are read-only; JSON export provides a portable copy.

Stale versions are rejected instead of silently overwriting newer records. No payments are taken, no messages are sent and no Discord resources are changed by this workflow. Attachments, reusable scope templates and change-order history are future work.

Connection profiles are non-secret localhost API metadata, not server credentials. Endpoint/poll preferences persist locally; tokens stay in memory. Expired/revoked sessions clear cached business views. The administration page manages accounts, and Activity shows actual stored operations.

## Verification

Stop the normal API runner before these commands:

```powershell
pnpm local test
pnpm local native-test
pnpm local recovery-check
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm audit
```

local test creates a fresh UTF8 database, applies migrations, runs all 13 desktop/API tests, and drops only that disposable database. Plain pnpm test explicitly skips database tests without KUSH_TEST_DATABASE_URL. native-test requires the compiled executable; it creates its own database/API, bootstraps temporary staff, tests real window state, account and project workflows, downloads/reads the exported JSON, runs an axe scan, captures screenshots and cleans up its own processes/data. Screenshots under ignored test-results/ contain clearly labelled test data.

recovery-check verifies encrypted application snapshot recovery with nonempty user/profile/client/project/audit fixtures, Unicode, content digests and rejection checks. Read docs/security/RECOVERY.md for real backup/restore commands. Backups do not include sessions and never overwrite an existing database. Backup passphrases must be kept separately.

The legacy Windows-1252 development database was copied to a verified UTF8 database without deleting the original. Current selection is in ignored .local/database.json. New clusters/test/restore databases explicitly use UTF8; pnpm local upgrade-encoding handles a legacy copy. KUSH_LOCAL_DATABASE can temporarily select a restored database.

## Boundaries

Hardware-specific multi-monitor/DPI/snapping and manual assistive-technology checks remain unverified. No broad production-security, installer or live-integration claim is made. Dependency advisory results are not a security certification.

This is an independent nested Git repository without a remote or publication. The parent portfolio sees ALL PROJECTS as untracked; do not accidentally add the project/database/dependencies to that repository. No Veyrix code or assets were reused. Engineering roles are in agents/, the supplied directive in docs/FOUNDING-DIRECTIVE.md, and commercial validation templates under docs/business/.

The original KUSH logo has not been attached. Styling remains functional; advanced brand work is deferred. Live Discord changes, production deployment, paid services and customer charges require owner approval.

## Local support tickets

Administrators can create a support workspace and manage its members. Membership is required even for global administrators. Workspace owners manage all tickets; staff see assigned tickets; customers see their own tickets and public replies. A staff-created ticket is assigned to its creator. Use the Support workspace to create, update, reply, add private notes, close with a reason, reopen and download a JSON transcript. Customer exports exclude private notes and staff-only events.

Create customer accounts with the customer application role; these accounts cannot access clients, projects, profiles, activity or administration. Guild IDs are unverified metadata. This slice does not connect to Discord. See docs/discord/M3-ACCEPTANCE.md for remaining work.
