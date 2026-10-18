# Local API foundation

Requires Node 24, pnpm and PostgreSQL 17 or later. API listens only on `127.0.0.1:4310`.

1. Set a unique `KUSH_DB_PASSWORD` in the current shell. Start PostgreSQL with `docker compose -f infra/docker/compose.yml up -d` from the repository root (Docker is optional; an existing local PostgreSQL server also works).
2. Set `DATABASE_URL` to your local PostgreSQL connection URI, URL-encoding password characters when needed. No database credentials are supplied by the application.
3. Run `pnpm --filter @kush/database migrate`. The versioned SQL migration is transactional and serialised by a PostgreSQL advisory lock. Drizzle defines and queries the same schema.
4. Set `KUSH_ADMIN_EMAIL` and `KUSH_ADMIN_PASSWORD` (at least 14 characters), then run `pnpm --filter @kush/api bootstrap-admin`. This inserts a new administrator and never overwrites an existing account. Remove the password environment variable immediately afterwards.
5. Run `pnpm dev:api`. `GET /health` returns 503 until all current migrations and required schema are accessible. `GET /openapi.json` documents the initial routes.

Credentials must not be committed. Staff administration, authenticated password changes, administrator resets and explicit offline owner recovery are implemented. Login limits persist in PostgreSQL across restarts; the global request limiter remains in memory. Production deployment, TLS, MFA and public self-service recovery remain future work.

Sessions use opaque random 256-bit tokens; only SHA-256 token digests are stored. Sessions expire after eight hours and logout deletes them. Clients should keep tokens in memory. Passwords use Node's scrypt with independent random salts. Roles are admin, operator and viewer; only admin can read audit history. Audit history contains action and actor identifiers, never passwords or session tokens.

`pnpm --filter @kush/api test` runs cryptography and injected failure-boundary tests. For real database tests, migrate a dedicated test database and set `KUSH_TEST_DATABASE_URL` before running the same command. Without that variable the PostgreSQL integration test is explicitly skipped. It inserts randomly named test accounts and removes its own rows afterwards. Do not point integration tests at a customer or production database.

The easiest tested setup is pnpm local api from the root; it manages project-local PostgreSQL without Docker. Use pnpm local test for a fresh disposable database, and see the root README and docs/security/RECOVERY.md for the full runtime, Unicode upgrade and encrypted snapshot procedures.
