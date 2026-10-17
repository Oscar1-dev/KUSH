# KUSH Accounts — audit and proposed design

Status: **proposal, awaiting owner approval.** Nothing in this document has been implemented yet.
Date: 17 October 2026.

## 1. What already exists (audited)

| Area | Current state | Reusable? |
|---|---|---|
| `users` | email + Argon2 password hash, `role` admin/operator/viewer/customer, `disabled`, `kind` account/discord | Yes, extend |
| `sessions` | opaque 32-byte token, SHA-256 hashed at rest, 8 h fixed expiry, `Authorization: Bearer` only | Yes, extend |
| Login | `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/password`; IP rate limit (`login_attempts`) | Staff only |
| Account creation | Admin-only `/admin/users`. **No self-service customer sign-up.** | Gap |
| Discord linking | One-time code: `/discord/tenants/:t/links/start` → `!link CODE` in Discord. Tenant-scoped, relinkable (0010). Starting a code resets an existing link (known UX issue). | Replace with OAuth, keep as fallback |
| Guest identities | `discord_identities` + `users.kind='discord'`: placeholder customers created when someone opens a ticket in Discord | Merge into real accounts |
| Entitlements | `products`, `entitlements`, `purchase_events`, role-sync queue — live-verified | Yes, as is |
| Customer guard | Customers can only reach `/support/`, `/commercial/`, `/discord/` | Yes, add `/account/` |
| OAuth2 | **None.** No Discord OAuth, no cookies, no CORS, no PKCE | Gap |
| Downloads | **None.** | Gap |
| Exposure | API binds `127.0.0.1:4310` only | Needs a public route to go live |

Bottom line: the data model for entitlements and roles is done. The missing pieces are customer account creation, Discord OAuth2, browser sessions, desktop sign-in and downloads.

## 2. Proposed design

### 2.1 Accounts (priority 1)
- One `users` row per person, `role='customer'`.
- New table `user_identities(provider, subject, user_id, verified_at)`. It is global, not per tenant, and uniquely indexed on `(provider, subject)`. Provider `discord` comes first; email/password stays for staff.
- The first Discord sign-in creates the account. If a guest identity (`kind='discord'`) already exists for that Discord ID, it is **upgraded in place**, so ticket history is kept.

### 2.2 Discord OAuth2 (priority 2)
- Authorization Code flow, scopes `identify` and optionally `email`. It is free.
- Requests use `state` and a PKCE verifier stored server-side for 10 minutes.
- The client secret lives in `.local/secrets/discord-client-secret`.
- Signing in also creates the verified Discord link, which enqueues a role sync. This replaces the `!link CODE` step. The code flow stays as a fallback.

### 2.3 Website sessions (priority 3)
- The cookie is `__Host-kush_session`: HttpOnly, Secure, SameSite=Lax. It holds the existing hashed-token session.
- Sessions have a sliding 30-day expiry with a 12 h idle re-validation.
- CSRF protection uses Origin checks plus a double-submit token on POST requests.
- `/account` endpoints: profile, linked accounts, sessions list, revoke session, delete-account request.

**Recommended for £0:** the backend serves its own small account pages (`/account/*`: sign in, dashboard, downloads) on the API's origin. The marketing website only needs a plain "Sign in" link, so it stays untouched, and cookies stay first-party. The alternative is a single-page app on `github.io` calling an API on another domain. That needs third-party cookies, which browsers block, or tokens in JavaScript, which is weaker.

### 2.4 "Sign in with KUSH" for desktop apps (priority 4)
- KUSH acts as its own small OAuth2 server for first-party public clients, following RFC 8252: Authorization Code + PKCE with a loopback redirect (`http://127.0.0.1:<random port>/callback`).
- Apps open the system browser to `/oauth/authorize`. The user signs in (Discord) and the app receives a code, which it exchanges for:
  - a 15-minute access token, and
  - a rotating refresh token with reuse detection, stored in the OS keychain (Tauri plugin).
- Clients are registered in a `oauth_clients` table. There are no client secrets in desktop apps.

### 2.5 Entitlements and licences (priority 5)
- This uses the existing tables. New pieces:
  - `GET /account/entitlements`.
  - `POST /licences/verify` for apps. It returns a short-lived signed licence token (Ed25519), so apps can verify it offline for a grace period.

### 2.6 Role sync (priority 6)
- Already live. The only change: OAuth linking enqueues the same `linked` job.

### 2.7 Protected downloads (priority 7)
- `downloads(product_id, version, file_key, sha256)`.
- A request goes to `POST /account/downloads/:id`. The backend checks the active entitlement, then returns a URL signed with HMAC that is valid for 5 minutes and tied to the user and file.
- Files come from local disk at first, so there is no cost. They can move to free object storage later without changing the API.
- The Discord `!download` command calls the same endpoint, so authorisation lives in one place.

### 2.8 Dashboard (priority 8)
- Server-rendered pages backed by the endpoints above: entitlements, downloads, linked Discord, sessions, and tickets (existing support APIs).

## 3. £0 budget notes
- Discord OAuth2: free.
- Signing keys and crypto: built into Node.
- Hosting the public API: free options include a Cloudflare Tunnel from this machine. That requires the PC to be online.
- **The one likely cost to decide later:** a custom domain (~£10/yr). OAuth redirects and cookies work on a tunnel's free subdomain, but a stable domain is strongly recommended before real customers.
- Nothing will be deployed publicly without approval.

## 4. Order of work (each slice tested before the next)
1. Migration: `user_identities`, `oauth_states`, cookie session fields. Upgrade guest identities.
2. Discord OAuth2 sign-in + linking (local-only redirect `http://127.0.0.1:4310/auth/discord/callback`; needs the redirect added in the Developer Portal — owner step).
3. Cookie sessions, CSRF and `/account` pages.
4. Desktop PKCE loopback flow, proven with the KUSH Developer app.
5. Licence verify endpoint.
6. Downloads.
7. Dashboard.
8. QA and the readiness report.

No customer-facing products are built until all of this passes.

## 5. Decisions needed from the owner
1. Approve the design, especially the backend-hosted account pages, which keep the marketing site untouched.
2. Owner step for slice 2: add the redirect URI in the Discord Developer Portal and save the client secret to `.local/secrets/discord-client-secret`. I will not handle the secret.
3. Request `email` scope? It is useful for receipts. Without it, accounts are Discord-only.
