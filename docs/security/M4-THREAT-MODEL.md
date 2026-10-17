# M4 Discord threat model

Status: source and design review. It does not claim a bot is installed, the guild is configured, or any live control is verified.

## Trust boundaries and assets

The Discord gateway and interactions API are untrusted external inputs. The bot process is a limited adapter. The KUSH API and PostgreSQL remain authoritative for ticket, commission, marketplace, partner, account-link, assignment, and audit state. Discord IDs identify platform objects but do not prove KUSH identity or entitlement.

Protected assets include the bot token, API service credential, account-link codes, customer contact and request content, internal notes, quotes, commercial records, moderation evidence, configuration mappings, transcripts, and audit history. The Discord guild owner, host-machine owner, database owner, and explicitly authorised KUSH administrators are trusted principals.

| Threat                                    | Required control                                                                                                                                               | Verification evidence                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Forged or replayed component interaction  | Use Discord-library verified interactions; bind signed custom IDs to action, guild, user, resource and expiry; store interaction ID/request key                | Unit tests for changed user/guild/resource, expiry and duplicate delivery     |
| Discord retry creates duplicate record    | Use interaction ID as backend idempotency key; compare immutable creation payload                                                                              | Repeat returns same ID; changed payload conflicts                             |
| Guild or tenant substitution              | Allowlisted guild ID plus verified tenant mapping; never accept guild/tenant from a modal as authority                                                         | Cross-guild and cross-tenant rejection tests                                  |
| Role spoofing or stale staff access       | Fetch interaction member roles from Discord payload/API; then enforce backend tenant role and assignment                                                       | Removal/reassignment takes effect immediately                                 |
| Customer reads another request            | Backend owner/assignment checks on list, detail, reply, close, reopen and transcript                                                                           | Two-customer isolation tests and live channel checks                          |
| Private note or commercial data leaks     | Separate staff-only record kind; no customer rendering, mirroring, notification or transcript inclusion                                                        | Customer export and channel assertions contain no staff data                  |
| Guessable transcript URL                  | Authenticated ephemeral delivery or short-lived single-use token with audience binding; no public object URL                                                   | Unauthorised, expired and replay access rejected                              |
| Malicious modal text or mentions          | Length/schema validation, Unicode normalization policy, render as text, suppress allowed mentions, no HTML execution                                           | Mention/link/markdown/control-character cases                                 |
| Mention flooding and spam                 | Discord AutoMod; per-user and per-guild command limits; bounded open-request count; cooldowns                                                                  | Threshold and recovery tests; ordinary use remains allowed                    |
| Scam or malicious links                   | Discord AutoMod keyword/domain policy, moderator review, avoid automatic fetching or link previews in privileged logs                                          | Known test-domain event reaches restricted moderation log                     |
| Unauthorised moderation                   | Server-side command allowlist, Discord permission check, actor/target hierarchy check, reason and confirmation                                                 | Member/staff/peer/higher-role denial tests                                    |
| Mass deletion or destructive sync         | Dry-run by default, stable IDs, create/update allowlist, never delete unknown resources, explicit apply/confirmation                                           | Repeat run is no-op; unknown resources preserved; partial failure recoverable |
| Bot token disclosure                      | Environment-only secret, ignored `.env`, startup presence check, logger redaction, never return config secret                                                  | Secret scanning and induced-error log review                                  |
| KUSH API credential misuse                | Dedicated bot principal with least privilege, short rotation procedure, loopback/private transport, no desktop reuse                                           | Bot cannot call human administration or unrelated tenant routes               |
| Log disclosure                            | Structured metadata allowlist; omit message bodies, tokens, codes, email and transcript contents                                                               | Captured logs inspected in tests                                              |
| Rate limit or Discord outage              | Honour library retry metadata, bounded exponential backoff with jitter, durable/outbox state for backend events                                                | 429, disconnect, restart and poison-event tests                               |
| Duplicate/out-of-order notifications      | Durable event ID and destination dedupe; compare backend version before publish                                                                                | Restart/replay produces one notification and current state                    |
| Compromised bot deletes channels or roles | No Administrator; role hierarchy ceiling; restrict Manage Channels/Roles; audit provisioning operations                                                        | Installed permission integer and effective role inspected live                |
| Account-link takeover                     | High-entropy, single-use, short-lived code initiated in authenticated KUSH session; bind Discord user on redemption; rate limit                                | Expired, reused, wrong-user and brute-force attempts rejected                 |
| Sensitive backup                          | Export stable IDs/config only; exclude token, service credentials, messages and personal request content; encrypt operational backups if they contain mappings | Backup schema assertion and secret scan                                       |

## Abuse controls

Apply layered, proportionate controls. Discord AutoMod should address mention spam and clearly malicious/scam phrases or domains; it should alert a restricted moderation channel rather than silently overblock broad ordinary vocabulary. The bot rate-limits ticket/application creation by linked user and guild, caps concurrent open records, and returns an ephemeral retry time. Duplicate interaction IDs are safe replays. Public suggestion/report interfaces constrain length and suppress mentions.

Moderation actions require a nonblank reason and immutable audit metadata. Ban, kick, bulk purge, role-management, and configuration apply require an explicit confirmation step naming the target and impact. Purge has a conservative maximum and cannot include pinned/old messages outside the reviewed range. The bot refuses to act on the guild owner, itself, peers/higher roles, or roles outside its configured allowlist.

Cannabis-inspired branding does not make the server a marketplace for controlled substances. Rules and marketplace review prohibit illegal goods, drug sales, evasion, and age-inappropriate commercial content. Discord's current [Community Guidelines](https://discord.com/guidelines) prohibit selling or facilitating sales of regulated or potentially dangerous goods, and its [regulated-goods explainer](https://discord.com/safety/clarifying-our-dangerous-and-regulated-goods-policy) expressly includes marijuana. KUSH must review applicable law and Discord policy before any material change in business scope.

## Secret handling

Required environment values are documented by name only in `.env.example`. Real values belong in the host's protected environment or current-user protected local configuration. Never put them in Discord channels, screenshots, transcripts, configuration backups, desktop storage, command output, crash reports, or repository history.

At minimum redact authorization headers, `DISCORD_TOKEN`, bot/API service credentials, link codes and webhook URLs. Fail closed when a secret is absent. Rotate the Discord token immediately after suspected exposure, invalidate the KUSH service credential, stop the process, inspect recent audit events, and redeploy from a known-clean environment. Token rotation does not remove malicious guild permissions, so inspect application installations, bot role, webhooks and audit log too.

## Residual risks and launch gates

The combined process needs `Manage Channels` and `Manage Roles` to reconcile configuration and dynamic private channels. Compromise therefore still has meaningful guild impact even without Administrator. Separating a short-lived provisioner credential/process from the steady-state runtime is preferred before public launch; otherwise retain strict stable-ID allowlists and alert on every role/channel mutation.

Discord private channels are not an end-to-end encrypted store. Minimise replicated customer data, keep the full record in KUSH, and agree retention before launch. Local/self-hosted operation is available only while the machine, database, API, and bot process remain online; it is not 24/7 hosting.

Launch remains blocked until automated security tests pass and the live checklist in `docs/discord/DEPLOYMENT.md` records effective permissions with an authorised test guild. A source-level permission matrix is not sufficient evidence.
