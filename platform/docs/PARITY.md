# Discord ↔ website parity

Every operation exists once, in the KUSH API. Discord commands, buttons,
menus and modals, and website pages and forms, are two front ends on the
same backend services. Staff permissions are always decided by the API from
the person's **live Discord roles** (plus 2FA on the website). Changes made
in one appear in the other: synchronously where the API is the source of
truth, or through the outbox / role-sync queue (leased jobs, retries with
backoff, dedupe keys) where Discord has to do something.

✅ both · 🌐 website only (by design) · 💬 Discord only (by design) · ⏳ not built yet

Updated 20 Oct 2026 (blueprint v3).

## Customers & community

| Operation | Discord | Website | Backend / sync |
| --- | --- | --- | --- |
| Sign in / link account | `/account` link code | Discord OAuth sign-in | One identity; `discord_account_links` |
| Find your way | #welcome navigator menu | Site navigation | — |
| Accept rules → Member | Rules button | — 💬 | `members/:id/rules` → role sync |
| Notification roles | #roles toggle buttons | — 💬 | Allowlisted opt-in roles only |
| Open a ticket | `/ticket create`, panel buttons | `/account/support/new` | Same ticket; website tickets get a Discord channel via outbox |
| Reply, close, reopen, transcript | Ticket channel, `/ticket close`, `!reopen`, `/ticket transcript` | Ticket page ✅ | Mirrored both ways |
| Report a member | `!report`, Member report category | — 💬 (about Discord activity) | Reports queue, moderators only |
| Request a commission | `/commission create`, panel button → picker → form | `/commission` ✅ | `createCommission`; linked ticket + private channel |
| Commission status | `/commission status` | `/account/commissions` ✅ | Same record |
| Accept / pay a quote | — | Commission page 🌐 (Stripe Checkout) | Webhook marks it paid |
| Request a revision | — | Commission page 🌐 | Outbox notifies staff |
| Products, buy | `/products`, `/buy` | `/pricing` ✅ | Same checkout (Stripe test mode, server prices) |
| Orders, receipts | `/orders`, `/order` | `/account/orders` ✅ | Same orders |
| Store credit | `/credit` | `/account/credit` ✅ | Ledger; **spending at checkout is switched off** until the owner enables it |
| Referrals | `/referrals`, `/referral rewards\|leaderboard\|claim` | `/account/referrals` ✅ | Invite attribution + codes; anti-abuse |
| Downloads, licences | `/downloads`, `/licenses` | `/account/downloads`, `/account/products` ✅ | Signed, expiring links |
| Vouch | `!vouch` | `/vouches` (read) | Public wall |
| Staff application | Application ticket | `/careers`, `/account/applications` ✅ | Private Discord channel via outbox |
| Sign NDA | NDA button + modal | Agreement page ✅ | Same agreement, `signed_via` recorded |
| Notifications | DMs (house-style cards) | `/account/notifications` ✅ | Same events feed |
| Two-factor, sessions | — | `/account/security`, `/account/sessions` 🌐 | — |

## Staff

| Operation | Discord | Website | Backend / sync |
| --- | --- | --- | --- |
| Customer lookup | `/staff customer @member` | `/staff/customers/[id]` ✅ (orders, commissions, tickets, credit, referrals, roles, cases) | `customers.view` |
| Credit adjustment | — 🌐 (needs 2FA) | Customer page ✅ | Ledger entry with actor + reason; never cash |
| Grant / revoke programme roles | `/staff role` | Customer page ✅ | `setRoleGrant` (one operation); allowlist only; role sync applies it; Discord enforces the bot's hierarchy |
| Ticket queue / claim / assign / status | `/tickets`, `/ticket claim`, `!assign`, `/ticket close` | `/staff/tickets` ✅ | Live roles |
| Ticket priority | `!priority` | Ticket page ✅ | Same field |
| Add someone to a ticket | `/ticket add` | — 💬 (Discord channel access) | `support_ticket_participants` |
| Internal notes | `!note` | Ticket page ✅ | Never shown to customers |
| Commissions: list, status, quote, assign, complete | `/staff commissions`, `/commission …` | `/staff/commissions` ✅ (full quote form) | Same services; Discord can't move money |
| Offline payment, refunds | — 🌐 (2FA) | Commission page, `/staff/orders` ✅ | Audited; refunds via Stripe |
| Products | `/product create\|edit\|archive` | `/staff/products` ✅ | Stripe product sync |
| Prices | — | `/staff/catalogue` 🌐 | API catalogue drives the site and `/products` |
| Orders | `/staff orders` | `/staff/orders` ✅ | — |
| Business numbers | `/staff stats` | `/staff` overview ✅ | Shared `businessStats()` |
| Referral review, reward delivery | — | `/staff/referrals` 🌐 | Flagged referrals never count automatically |
| Applications → NDA → approve → activate | Application channel | `/staff/applications` ✅ | Activation grants the role via outbox |
| NDA templates & agreements | — | `/staff/agreements` 🌐 | — |
| Moderation actions | `!warn` `!timeout` `!untimeout` `!kick` `!ban` `!unban` `!modnote` | — 💬 (act on Discord members) | Each records a numbered case |
| Moderation cases | `!cases`, `!case` | `/staff/moderation`, customer page ✅ | Same cases |
| Remove a vouch | `!unvouch` | `/staff/moderation` ✅ | Website removal deletes the Discord message via outbox |
| Offboard staff | `!offboard` | `/staff/team` ✅ | Shared Discord half (roles, DM, #bot-log) |
| Bot / outbox health | `!health` | `/staff/operations` ✅ | Retry failed deliveries from the website |
| Server blueprint, access checks | `!sync`, `!permissions`, `!config` | — 💬 | Owner-approved CLI applies changes |
| Audit log | #bot-log | `/staff/audit` ✅ | `audit_events` |

## By design, not mirrored

- **Money never moves from Discord.** Refunds, offline payments and credit
  adjustments need the website's 2FA.
- **Staff roles are never granted by the bot or the website role tool.**
  They come from recruitment activation or the owner in Discord.
- **Moderation actions on members** stay in Discord, where the member is.

## Not built yet (honestly unavailable)

- `!guide <product>`: guides publish with each product.
- Self-service partner applications: partners go through a ticket for now.
