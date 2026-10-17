# KUSH server blueprint

Status: design only. No server, roles, channels, commands or bot deployment have been created. Preserve the old server. Live application requires explicit owner approval after a dry-run diff and permission tests.

Start with a compact server supporting software, commissioned services and community. Expand only when activity needs it.

| Category                  | Channels                                                                                         | Permission profile |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| START HERE                | welcome, rules, verification, announcements, getting-started                                     | Read-only          |
| KUSH                      | about-kush, services, products, roadmap, changelog                                               | Read-only          |
| COMMUNITY                 | general, development, showcases, feedback, suggestions, media                                    | Community          |
| SUPPORT                   | support-information, open-ticket, known-issues, service-status                                   | Read-only          |
| PRODUCTS                  | releases, downloads-information, beta-programme                                                  | Read-only          |
| PRODUCTS                  | product-feedback                                                                                 | Community          |
| PARTNERS                  | partner-information, reseller-information, creator-information, applications                     | Read-only          |
| STAFF                     | staff-chat, ticket-queue, staff-announcements, operations, bot-logs, audit-events                | Staff              |
| ADMINISTRATION            | owner-operations, infrastructure-alerts, payment-alerts, security-events, integration-management | Admin              |
| PRIVATE TICKETS (dynamic) | ticket-ID                                                                                        | Ticket             |

Every named channel inherits its profile from PERMISSIONS.md. This is a candidate information architecture, not an instruction to create every empty channel. At first rollout, retain only channels with a named purpose and maintainer. Applications and ticket opening should use a private interaction, never publish personal information in public channels.

Role order candidate: Owner → Administrator → Developer → Support Lead → Support Staff → Creative Partner → Verified Reseller → Verified Customer → Beta Tester → Community Member → Restricted. Bot placement must be above only roles it must manage, and below human administrative roles. Display order does not grant access; channel overwrites and aggregate roles must be tested.

Future bot: one modular discord.js process, persisted ticket state, slash interactions, bounded retries and structured redacted logs. Prefer interactions to broad message collection. No privileged intents by default; document and justify any message-content/member intent before requesting portal approval. Bot tokens never belong in desktop settings or repository files.

Planned declarative format: stable internal keys mapping to existing Discord IDs; roles, categories, channels and overwrite profiles. Reconciliation must inspect current state, preview creates/updates and detect conflicts; owner approval precedes apply. Repeat application must produce no changes. Never delete unknown resources. Persist mapping and audit every approved mutation.

Required dry-run cases: fresh guild, repeat apply, renamed channel, missing permission, role hierarchy conflict, rate limit and partial failure. No automatic permission test or reconciler currently exists; implement it in M3/M4 before live rollout.

References: [Discord permissions](https://docs.discord.com/developers/topics/permissions), [Gateway intents](https://docs.discord.com/developers/events/gateway#gateway-intents), [discord.js](https://discord.js.org/docs).
