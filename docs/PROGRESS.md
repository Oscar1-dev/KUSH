# KUSH platform — development progress

Living document so work can resume after any interruption. Updated as each
phase lands. Status: ✅ done & verified · 🟡 partial · ⏳ not started ·
🔒 blocked on an external credential or owner action.

## Phase 1 — Inventory (2026-10-19)

### Already working (before this round)

| Area | State |
| --- | --- |
| Accounts | ✅ Discord OAuth2 (PKCE + state), web sessions, TOTP 2FA + recovery codes, session list/revoke |
| Staff access | ✅ Live Discord roles → staff roles → permissions, mandatory staff 2FA, audit log |
| Support | ✅ Tickets on website and Discord (same record), private channels, claim/assign, notes, transcripts |
| Commissions | 🟡 Request → review → quote → accept → payment_pending → in_progress → review → completed; milestones; one thread on web + Discord. No real payment, no revision/paid/refunded states, quotes lack deliverables/expiry/revisions |
| Products | 🟡 `products` table for entitlements/downloads only (slug, name, status, Discord role). No price, no Stripe |
| Downloads | ✅ Signed 5-minute links, entitlement re-checked |
| Recruitment | ✅ Applications, NDA (web or Discord), activation grants roles |
| Discord bot | ✅ 41 commands (prefix + generated slash), tickets, moderation cases, rule watch, vouches, offboarding, uptime alerts, role sync, outbox worker |
| Notifications | ✅ Outbox with lease/backoff/dedupe, website feed |
| Website | ✅ Public site (home, services, work, about, careers, vouches, contact, FAQ, commission), customer + staff dashboards |
| Catalogue | 🟡 Six services hard-coded in website `site-content.ts` |

### Missing (this round)

- Catalogue and pricing managed in the backend (draft/published/archived, fixed/from/range/quote, add-ons, delivery estimates, availability, portfolio).
- Stripe: products/prices, Checkout Sessions, verified webhooks, orders, payments, refunds, receipts, reconciliation.
- Commission payments via Stripe, richer quotes, full status set.
- Store-credit ledger, referrals with anti-abuse, milestone rewards.
- Typed Discord slash commands for products, orders, commissions, tickets, referrals, credit, staff.
- Customer pages: orders, payments, referrals, credit. Staff pages: orders, payments, products/catalogue editor, referrals, stats.
- Legal pages (terms, privacy, refunds) marked for owner review.

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 1 | Inventory | ✅ |
| 2 | Shared foundation (schema, permissions) | ✅ migration 0024, new staff permissions |
| 3 | Catalogue & products | ✅ API (`/public/catalogue`, staff editor routes, Stripe product sync) · 🟡 website still reads its own copy |
| 4 | Stripe | ✅ test-mode code paths verified with signed fake events · 🔒 no real test keys yet |
| 5 | Commissions | ✅ full status set, richer quotes, quote checkout, offline payment, revisions |
| 6 | Discord | ✅ typed slash + prefix commands, commission intake, invite tracking · 🔒 slash registration on the live server awaits owner OK |
| 7 | Referrals & credit | ✅ ledger, referral engine, Discord join/leave tracking and code claims |
| 8 | Website dashboards | ⏳ |
| 9 | Security & QA | ⏳ |
| 10 | Handover | ⏳ |

## Phase 2–5, 7 backend (2026-10-19)

Landed in `services/api` (112 API tests passing, against real PostgreSQL):

- **Catalogue** — `catalogue_services` / `catalogue_offers`, draft/published/archived, fixed/from/range/quote pricing, add-ons, delivery estimates. Seeded with the provisional price list (portfolio £40, business £80, advanced £300–£700, web app from £150, desktop from £100, Discord setup £15, bot from £25, Rust config £20 / plugin £25 / map £40, technical from £10, video/GFX £15, UI/UX £20). All prices editable by staff (`catalogue.manage`).
- **Products** — price, visibility, Stripe product/price sync on save (`products.manage`).
- **Checkout** — server-side price only; idempotent per request ID; store credit reserved first and released if the session expires.
- **Webhooks** — raw-body signature check, every event stored once (`stripe_events` primary key = event ID) so replays are no-ops; amount, currency and session are checked before anything is marked paid.
- **Refunds** — card first, then credit; idempotent; in-flight refunds count as spent so concurrent refunds can't exceed what was paid; `charge.refunded` from the Stripe dashboard is reconciled without double counting.
- **Credit ledger** — row-locked, unique idempotency keys, database `CHECK balance >= 0`, never cashable.
- **Referrals** — 10 → £5 credit, 20 → customer role + one free eligible service, 25 → product up to £50. Rules: no self-referral, account age ≥ 14 days, stays ≥ 7 days, burst limit, one referrer per member ever, flagged cases go to staff review. Settings in `platform_settings`.
- **Commission flow** — submitted → under review → awaiting info → quoted → accepted → payment pending → paid → in development → awaiting review ⇄ revision requested → completed (or cancelled / refunded). Developers can only start work once it is **paid**.

Known gaps: a Stripe refund that succeeds while the API crashes before booking it stays `pending` (visible to staff) until reconciled by hand.

## Phase 6 Discord (2026-10-19)

Commands (each works as `/slash` and `!prefix`, from one definition; account replies are private):

- Customers: `/products` `/buy` `/orders` `/order` `/credit` `/referrals` `/referral rewards|leaderboard|claim` `/commission create|status`
- Staff (`staff` authority hint; the API re-checks live roles + exact permission): `/commission quote|assign|update|complete` `/product create|edit|archive` `/staff orders|commissions|assign|customer|stats`
- Tickets: `/ticket create|close|claim|add|transcript` (`!ticket` still opens one)
- The commission panel button now opens a service picker → form → API commission (with ticket). Members who haven't linked a KUSH account fall back to a commission ticket, as before.
- Discord staff actions never move money: refunds, offline payments and credit adjustments are website-only (2FA).
- Invite attribution: unambiguous use-count changes only ("exact" / "probable"); needs Manage Server, otherwise nothing is recorded and referral codes still work.

Tests: API 114, bot 187, all passing.

## Decisions & assumptions

- Money is stored as integer pence (GBP default); never floats.
- Stripe is the only card processor; KUSH never sees card data (Checkout only).
- An order is paid only when a verified `checkout.session.completed` webhook (or a zero-total store-credit order settled server-side) says so. Browser redirects never mark anything paid.
- Without Stripe keys the API reports payments as "not configured" (503) instead of pretending.
- Staff can record an **offline** payment (e.g. bank transfer) with `payments.manage`; it is audited and labelled offline, never shown as a Stripe payment.
- Referral attribution: Discord only exposes invite use counts, so attribution is inferred by diffing invite counts on join (needs the bot's Manage Server permission) or claimed with a personal referral code. Neither is presented as exact.

## Blockers

- 🔒 Stripe test keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) not yet provided.
- 🔒 Invite-based referral attribution needs Manage Server for the bot (code-based referrals work without it).
