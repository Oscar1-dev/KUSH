# Phase 1 — Integration audit (17 October 2026)

## Website (this folder)
- Next.js 15 App Router, React 19, Tailwind 4, Motion, Three/R3F.
- There is one route (`/`). It renders `InteractiveHero`, which contains the nav, the studio showcase and the closing section.
- `SiteExperience` sits in the root layout and runs on every page. It queries `.hero`, so new pages must be checked against it.
- Design tokens are in `globals.css`: `--bg #0b0b0d`, `--green #a7fa43`, `--purple #9363ee`, `--cream #efede6`.
- **Missing:** authentication, accounts, API calls, `.env.example`, tests, `src/lib/`.
- No git history existed. I created a local baseline commit (`65ada9c`) so changes are reviewable.

## Backend (`ALL PROJECTS/kush/services/api`, Fastify + PostgreSQL)
- **Implemented:**
  - Email/password staff login with `Authorization: Bearer` opaque sessions (8 h, hashed at rest).
  - An IP login rate limit and an audit log.
  - A customer role, confined to `/support/`, `/commercial/` and `/discord/`.
  - Support tickets and commercial requests (commissions).
  - Discord link codes.
  - Entitlements, products and role sync, all live-verified.
- **Missing:** Discord OAuth2, customer self-sign-up, cookies and CSRF handling, TOTP/MFA, staff permission sets mapped from Discord role IDs, notifications, downloads.
- The API binds to 127.0.0.1 only, which is good.
- Environment variable names in use:
  - `DATABASE_URL`
  - `KUSH_DISCORD_INTEGRATION_SECRET`
  - `KUSH_SIMULATED_PURCHASES`
  - `KUSH_BOT_HEALTH_PORT`
  - `KUSH_PREFIX_COMMANDS`
  - `KUSH_BACKUP_PASSPHRASE`
  - plus test and smoke variables.
- Secrets live in `.local/secrets/`. No Discord client secret exists yet.

## Discord bot
- The bot reaches the API over localhost with a shared integration secret and a guild-ID header.
- Its role IDs are config-driven (`configuredRoleId`), never matched by role name.
- Both of these can be reused for the staff dashboard's role checks.

## Integration plan (recommended)
- **Next.js acts as a backend-for-frontend.** The browser holds only an HttpOnly, SameSite=Lax `__Host-` cookie on the website's own origin. Next.js route handlers forward requests to the Fastify API server-side. The API stays private and remains the single authority for identity, sessions, MFA and permissions. This avoids the cross-site cookie problem entirely.
- **OAuth sign-in flow:**
  1. The website route `/auth/discord` calls the API, which creates `state` and the PKCE verifier and stores them server-side.
  2. Next.js sets a short-lived HttpOnly cookie that binds this browser to that flow (prevents login CSRF), then redirects to Discord.
  3. On `/auth/discord/callback`, the website hands the code and state to the API.
  4. The API exchanges the code with Discord, then creates or upgrades the account, including any existing Discord guest identity.
  5. The API issues a session.
- **Staff permissions:** the API maps configured Discord role IDs to permission sets, using live guild membership checked through the bot. If Discord is unavailable, access is denied. TOTP is mandatory for staff.

## Build order
1. API: migration (`user_identities`, `oauth_flows`, `mfa_factors`, `recovery_codes`), the OAuth service with a mockable Discord base URL, and tests.
2. Website: `src/lib/api.ts` (server-only), auth routes, sign-in page, account shell in the existing style.
3. TOTP/MFA.
4. Customer dashboard sections, backed by real records only.
5. `/staff` with role → permission mapping.
6. Bot notifications.
7. Product, licence and download foundations.

## Owner actions needed later (not yet)
- Add the Discord redirect URI.
- Save the client secret to `.local/secrets/discord-client-secret`.
- Decide on the email scope.
