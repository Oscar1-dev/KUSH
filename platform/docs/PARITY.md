# Discord ↔ website parity

Every operation exists once, in the KUSH API. Discord commands, buttons and
modals, and website pages and forms, are two front ends on the same
backend services. Changes made in one appear in the other: synchronously
where the API is the source of truth, or through the notification outbox
(leased jobs, retries with backoff, dedupe keys) where Discord has to do
something.

✅ both · 🌐 website only (by design) · 💬 Discord only (by design) · ⏳ not built yet

## Customers & community

| Operation | Discord | Website | Backend / sync |
| --- | --- | --- | --- |
| Sign in / link account | `!account` link code | Discord OAuth sign-in | One identity; `discord_account_links` |
| Accept rules → Member role | Rules button | — 💬 | `members/:id/rules` → role sync |
| Open a support ticket | `!ticket`, panel buttons | `/account/support/new` | Same ticket; website tickets get a Discord channel via outbox |
| Reply to a ticket | Type in the ticket channel | Ticket page | Mirrored both ways |
| Close / reopen ticket | `!close`, Close button, `!reopen` | Ticket page | Same status; channel access synced |
| Ticket transcript | `!transcript` | Ticket page (full thread) ✅ | — |
| Report a member | `!report`, Member report category | — (Discord-only: reports are about Discord activity) | Reports queue, moderators only |
| Commission request | Commission ticket category | `/commission`, `/account/commissions/new` ✅ | Quotes, milestones and messages in the account; staff announced via outbox |
| Accept / decline a quote | — | Commission page 🌐 | Outbox notifies staff |
| Products & downloads | `!downloads` (lists, links to site) | `/account/products`, `/account/downloads` | Files only via signed, expiring website links |
| Licence status | `!licenses` | `/account/products` ✅ | Entitlements |
| Vouch | `!vouch` | `/vouches` (read) | Vouches table; public wall |
| Partner programmes | `!partner`, `!apply seller/reseller` | — ⏳ | Commercial requests |
| Staff application | Application ticket | `/careers`, `/account/applications` ✅ | Private Discord channel via outbox; mirrored messages |
| Sign NDA | NDA button + modal | Agreement page ✅ | Same agreement, `signed_via` recorded |
| Notifications | DMs | `/account/notifications` ✅ | Same events feed |
| Two-factor, sessions | — | `/account/security`, `/account/sessions` 🌐 | — |

## Staff

| Operation | Discord | Website | Backend / sync |
| --- | --- | --- | --- |
| Ticket queue / claim / assign / status | `!tickets`, `!claim`, `!assign`, `!close` | `/staff/tickets` ✅ | Live Discord roles + 2FA on the website |
| Ticket priority | `!priority` | Shown, not editable ⏳ | Same field |
| Internal notes | `!note` | Ticket page ✅ | Never shown to customers |
| Commissions: review, quote, milestones | — | `/staff/commissions` 🌐 | Outbox DMs the customer |
| Applications: review → NDA → approve → activate | Application channel | `/staff/applications` ✅ | Activation grants the Discord role via outbox |
| NDA templates & signed agreements | — | `/staff/agreements` 🌐 | — |
| Moderation actions | `!warn` `!timeout` `!untimeout` `!kick` `!ban` `!unban` `!modnote` | — 💬 (they act on Discord members) | Each records a numbered case |
| Moderation cases | `!cases`, `!case` | `/staff/moderation` ✅ | Cases from bot commands and Discord's own tools |
| Rule-watch reports | #moderation-log buttons | — 💬 | Warn/timeout from a report records a case |
| Remove a vouch | `!unvouch` | `/staff/moderation` ✅ | Website removal deletes the Discord message via outbox |
| Offboard staff | `!offboard` | `/staff/team` ✅ | Shared Discord half (roles, DM, #bot-log); website path via outbox |
| Team roster & NDA status | — | `/staff/team` 🌐 | Live roles; former staff listed |
| Customers | — | `/staff/customers` 🌐 | — |
| Bot / outbox health, retries | `!health` | `/staff/operations` ✅ | Retry failed deliveries from the website |
| Server blueprint dry-run, access checks | `!sync`, `!permissions`, `!config` | — 💬 | Owner-approved CLI applies changes |
| Uptime alerts | #operational-alerts | — 💬 | Bot probes API, website, gateway |
| Audit log | #bot-log | `/staff/audit` ✅ | `audit_events` |
| Grant / revoke entitlements | `!entitlement` ⏳ | `/staff/catalog` (orders view) | Manual grants exist in the API; no staff UI yet |

## Not built yet (honestly unavailable)

- `!products`: needs a published catalogue; the command says so instead of
  inventing products.
- `!guide` / `!setup guide`: no product guides exist yet.
- `!entitlement grant/revoke` and a website grant form.
- Partner programme review on the website.
- Payments (Stripe, PayPal, bank transfer): intentionally off until launch.
