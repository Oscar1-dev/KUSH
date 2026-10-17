# Discord permissions and role hierarchy

Status: M4 security specification. The repository validator can verify the declarative model, but every effective permission must also be checked in the authorised guild before launch. Discord's guild owner and any role with `Administrator` bypass channel overwrites; those principals are explicitly trusted and must be tightly controlled.

## Bot installation

Use a guild install with OAuth2 scopes `bot` and `applications.commands`. Never use a user token or self-bot. `Administrator`, `Mention Everyone`, `Manage Webhooks`, `Manage Events`, and access to voice audio are not required. Discord requires `Manage Guild` to read or change AutoMod rules. Configure AutoMod through an authorised human administrator, or grant a dedicated provisioner `Manage Guild` only for the reviewed AutoMod apply and revoke it afterward; the steady-state bot does not retain it.

The maximum permission set needed by the current combined channel/role provisioning, ticket, moderation, and role-selection process, excluding AutoMod administration, is:

- View Channels
- Send Messages
- Manage Messages
- Embed Links
- Attach Files
- Read Message History
- Manage Channels
- Manage Roles
- Moderate Members
- Kick Members
- Ban Members

The corresponding Discord permission integer is `1099780189206`. A separately approved temporary provisioner that also configures AutoMod needs `Manage Guild`, producing `1099780189238`; revoke that permission after the reviewed apply. Treat either integer as a review aid, not as proof of the installed role's effective permissions. After provisioning, remove `Manage Channels`, `Manage Roles`, `Kick Members`, and `Ban Members` if the enabled runtime modules do not use them. The bot role must remain below Owner, Co-Owner, Management, Administrator, and every human staff role it must not assign or moderate. It must be above only the opt-in and entitlement roles it is authorised to manage.

No privileged gateway intent is required for slash commands, buttons, modals, or guild configuration. Start with `Guilds` only. Add `GuildMembers` only if a reviewed entitlement reconciliation feature actually needs member enumeration. Do not request `MessageContent` merely for moderation or support; interaction inputs and Discord AutoMod cover the intended flows.

## Role order and capabilities

Highest to lowest:

1. Owner (guild owner account; no bot-assigned role)
2. Co-Owner
3. Management
4. Administrator
5. Developer
6. Support Team
7. Moderator
8. Commission Manager
9. Marketplace Reviewer
10. Partner Manager
11. KUSH Bot
12. Verified Seller
13. Official Partner
14. Reseller
15. Premium Customer
16. Verified Customer
17. Beta Tester
18. Contributor
19. Product Updates / Announcements / Development Updates / Marketplace Updates / Community Events
20. Member

Human staff roles do not receive Discord's `Administrator` permission by default. Management access is granted by explicit category overwrites. Commercial, customer, and notification roles are never self-assignable unless the role is explicitly listed as an opt-in notification role. The bot rejects attempts to assign any role at or above its highest managed-role allowlist entry even if Discord would permit the operation.

## Channel profiles

`Y` means explicit allow when needed, `N` means explicit deny where inheritance could otherwise expose the channel, and `-` means inherit. `View` and `History` are separate because denying send does not guarantee history access. Thread permissions are explicit for read-only and forum-style channels.

| Profile / principal                         | View | History | Send | Send in threads | Create public threads | Create private threads | Manage messages | Manage channels |
| ------------------------------------------- | ---: | ------: | ---: | --------------: | --------------------: | ---------------------: | --------------: | --------------: |
| Information / Member                        |    Y |       Y |    N |               N |                     N |                      N |               N |               N |
| Information / authorised publisher          |    Y |       Y |    Y |               Y |                     N |                      N |               - |               N |
| Community / Member                          |    Y |       Y |    Y |               Y |                     Y |                      N |               N |               N |
| Community / Moderator                       |    Y |       Y |    Y |               Y |                     Y |                      N |               Y |               N |
| Product submissions / Member                |    Y |       Y |    Y |               Y |                     N |                      N |               N |               N |
| Product information / publisher             |    Y |       Y |    Y |               Y |                     N |                      N |               - |               N |
| Staff operations / ordinary member          |    N |       N |    N |               N |                     N |                      N |               N |               N |
| Staff operations / named staff role         |    Y |       Y |    Y |               Y |                     N |                      N |   role-specific |               N |
| Management / non-management                 |    N |       N |    N |               N |                     N |                      N |               N |               N |
| Management / Management and Owner           |    Y |       Y |    Y |               Y |                     N |                      N |               Y |               Y |
| Private request / unrelated member          |    N |       N |    N |               N |                     N |                      N |               N |               N |
| Private request / named customer            |    Y |       Y |    Y |               N |                     N |                      N |               N |               N |
| Private request / assigned authorised staff |    Y |       Y |    Y |               N |                     N |                      N |   role-specific |               N |
| Private request / KUSH Bot                  |    Y |       Y |    Y |               N |                     N |                      N |               Y |               Y |
| Audit and security / all other roles        |    N |       N |    N |               N |                     N |                      N |               N |               N |
| Audit and security / explicit leadership    |    Y |       Y |    Y |               N |                     N |                      N |               Y |               N |

Attachments, embeds, reactions, polls, external application commands, and `MentionEveryone` follow the same profile and are denied unless a channel has a documented need. `MentionEveryone` remains denied to the bot and ordinary staff. Forum channels allow members to create a post only where the workflow intentionally accepts public submissions; read-only forum channels must deny both `SendMessages` and `SendMessagesInThreads` as well as thread creation.

## Private support and business requests

Discord visibility is presentation, not authorisation. The KUSH API rechecks the authenticated Discord account link, tenant membership, ticket ownership or assignment, current record version, and command-specific role on every operation. A private request channel receives member overwrites only for its creator, assigned staff, relevant management, and the bot. Customer roles never grant access across requests.

Internal notes are never mirrored to a customer-visible channel or transcript. Staff reassignment removes the former assignee's overwrite before acknowledging success. If overwrite removal fails, the backend assignment remains authoritative and the incident is logged for reconciliation; the bot must not disclose subsequent content.

## Command authorisation

| Command group                                                              | Minimum authority                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/help`, `/about`, `/services`, `/products`, `/status`, `/faq`, `/profile` | Member                                                                         |
| Ticket open/list/close/reopen/transcript                                   | Linked customer for own records, or authorised staff for assigned records      |
| Ticket claim/assign/priority                                               | Support Team or Management, plus backend tenant authority                      |
| Commission request/status                                                  | Request owner or Commission Manager for assigned records                       |
| Commission quote/assign/close                                              | Commission Manager or Management                                               |
| Marketplace browse/submit/status                                           | Member for public browse; applicant for own application                        |
| Marketplace approve/reject                                                 | Marketplace Reviewer or Management                                             |
| Partner apply/status                                                       | Applicant for own application                                                  |
| Partner review                                                             | Partner Manager or Management                                                  |
| Warn/timeout/untimeout/purge                                               | Moderator or Management; target must be below actor and bot                    |
| Kick/ban                                                                   | Administrator or Management, explicit confirmation, target below actor and bot |
| Config/sync/audit                                                          | Management; destructive reconciliation requires a reviewed dry-run             |

Command visibility is convenience only. Every handler enforces the same rule server-side and returns an ephemeral denial. Guild roles alone never grant KUSH backend tenant access.

## Effective-permission acceptance

Before launch, verify using Discord's effective-permission view or controlled test accounts with combined roles:

- Member can view and read history in information and announcement channels but cannot send, create threads, or send inside existing threads.
- Member can participate only in intended community/forum channels.
- Commercial/customer roles cannot see staff, management, audit, or security channels.
- Two customers cannot see each other's request channels or retrieve each other's backend records.
- Unassigned and formerly assigned staff cannot see or operate a ticket.
- Support Team cannot see management or financial planning.
- KUSH Bot cannot manage roles above it, mention everyone, manage the guild, or use Administrator.
- A timed-out or restricted member cannot regain send permission through a second role or member overwrite.
- Category sync does not overwrite a deliberate private-channel exception.

Record guild ID, channel/role IDs, test principal, expected and actual result, timestamp, and reviewer. A config validator or dry-run is not live proof.

Official references: [Discord permissions and overwrite order](https://docs.discord.com/developers/topics/permissions), [gateway and privileged intents](https://docs.discord.com/developers/events/gateway), [application command authorisation](https://docs.discord.com/developers/interactions/application-commands), and [AutoMod permission requirements](https://docs.discord.com/developers/resources/auto-moderation).
