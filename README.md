# KUSH

The KUSH website and the platform behind it: one API that the website and the Discord bot both use.

## Repository layout

| Path | What it is |
| --- | --- |
| `/` (root) | The KUSH website (Next.js): public site, customer account and staff dashboard. |
| `platform/services/api` | The KUSH API (Fastify + PostgreSQL). The single source of truth the website and bot both call. |
| `platform/apps/discord-bot` | The KUSH Discord bot: tickets, moderation, vouches, NDA signing, role sync, uptime alerts. |
| `platform/packages/database` | Database migrations and access. |

Secrets are never committed. Locally they live outside git (`platform/.local/`, `.env.local`); see `.env.example` and the platform docs. Hosting (website, API, database and bot on one VPS) is still to be set up.

## Run on Windows

1. Install Node.js and pnpm if not already installed.
2. Extract this folder somewhere outside the existing KUSH app repository (or in a separate folder under ALL PROJECTS).
3. Open PowerShell in the extracted `kush-website-starter` folder.
4. Run `pnpm install`.
5. Run `pnpm dev`.
6. Open http://localhost:3000.

Build: `pnpm build` · Typecheck: `pnpm typecheck` · Lint: `pnpm lint`.

**Important:** The archive includes source code, not `node_modules`, and dependencies have not been installed or runtime-tested in this environment. Package versions are a starter range, not a lockfile. Run `pnpm install` to generate the lockfile and verify compatibility. If your existing pnpm version differs, the `packageManager` field is advisory; use your installed version or update it deliberately.

## Included

- App Router Next.js/React/TypeScript starter.
- Responsive, high-contrast editorial landing page.
- Animated KUSH hero, pointer-reactive lighting, orbit shapes, parallax, marquee, abstract identity artwork.
- Studio, capabilities, manifesto, and contact sections.
- Reduced-motion accessibility fallback.
- Tailwind v4 integration, Motion, Three.js + R3F + Drei ready for future 3D work.
- Brand, structure, performance, and visual roadmap docs.

## Before publishing

- Replace placeholder `hello@example.com` email in `src/components/interactive-hero.tsx`.
- Replace typographic KUSH wordmark with the original brand asset when supplied.
- Confirm actual service availability before publishing claims or accepting orders.
- Add privacy/cookie information appropriate to the actual tracking and contact features you deploy.
- Verify keyboard, mobile, reduced-motion, contrast and performance on actual devices.
- Customer accounts are implemented (see below). No commerce or contact form yet.

## Note on Tauri and Rust

Tauri/Rust remain appropriate for KUSH desktop products. A public browser website does not need them. Keep this frontend independently deployable, then integrate the KUSH API through documented, authenticated endpoints later.

## KUSH accounts (sign-in, 2FA, dashboard)

The website's server talks to the private KUSH API (`ALL PROJECTS/kush/services/api`).
The browser only ever holds an HttpOnly session cookie; identity, sessions, 2FA and
permissions are decided by the API. See `docs/INTEGRATION-AUDIT.md`.

1. Copy `.env.example` to `.env.local` and fill in `KUSH_WEBSITE_SECRET`
   (same value as the API's `KUSH_WEBSITE_SECRET`) and `KUSH_SITE_URL`.
2. Start the API with `KUSH_WEBSITE_SECRET`, `KUSH_MFA_KEY`, `KUSH_SUPPORT_TENANT_ID`
   and the `KUSH_DISCORD_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` settings.
   The redirect URI is `<KUSH_SITE_URL>/auth/discord/callback` and must also be
   added in the Discord Developer Portal.
3. `pnpm dev`, then open `/sign-in`.

Routes: `/sign-in`, `/sign-in/verify` (2FA), `/account/*` (customer dashboard),
`/auth/discord` and `/auth/discord/callback` (OAuth2 server routes).

To run a production build alongside `pnpm dev`, give it its own folder:
`NEXT_DIST_DIR=.next-e2e pnpm build` (otherwise the two overwrite each other's `.next`).
