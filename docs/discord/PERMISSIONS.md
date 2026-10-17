# Discord permissions and role hierarchy (blueprint v2)

Status: implemented as code in `apps/discord-bot/src/blueprint.ts` and verified by the effective-permission evaluator in automated tests. **Not yet verified in a live guild.** The generated per-channel result is in [PERMISSION-MATRIX.md](PERMISSION-MATRIX.md); a test fails if that file and the code disagree.

Discord's guild owner account and any role with `Administrator` bypass every channel overwrite. Only the Owner role carries `Administrator`.

## How Discord evaluates permissions

The evaluator (`src/permissions.ts`) implements the [official algorithm](https://docs.discord.com/developers/topics/permissions):

1. Guild owner → everything.
2. Base = `@everyone` permissions OR every held role's permissions; `Administrator` → everything.
3. Channel: apply the `@everyone` overwrite, then the **union** of held roles' denies, then the **union** of held roles' allows, then the member overwrite.
4. No `ViewChannel` → nothing. No `SendMessages` → no TTS, `@everyone` mentions, attachments or embeds. Timed-out members keep only `ViewChannel` and `ReadMessageHistory`.

Step 3 has a consequence that shapes the whole design: **a role allow always beats another role's deny on the same channel.** A "Restricted" role overwrite cannot, on its own, silence someone who also holds a role with an allow on that channel.

## Design rules

- **Participation comes from the Member role's guild-level permissions**, never from a channel allow. Community channels need no allow overwrites, so a channel-level Restricted deny works there.
- **Every non-community channel denies posting at `@everyone` level.** Private channels also deny `ViewChannel`. (Automated testing caught a bug in an earlier draft. Private read-only channels such as downloads and moderation-log denied only `ViewChannel`, so viewers inherited `SendMessages` from Member.)
- **Elevated access uses channel role allows** (staff, customers, partners, beta).
- **Restriction strips roles.** `rolesAfterRestriction()` keeps only Member and Restricted. The restriction workflow must remove all other roles; it records them for restoration, and entitlement roles are restored from the backend. A test shows why: Member + Beta Tester + Restricted can still post in `#beta-programme`.
- **Downloads are not role-gated.** `#downloads` and `#setup-guides` hold instructions only. Links are issued privately by the bot after a backend entitlement check, so revoked or refunded customers lose access even if a stale role remains.
- **Owner-only channels exclude the bot.** `#owner-operations` and `#confidential-partnerships` give the bot no access, so a bot compromise (with Message Content intent) cannot read them. The planner reports drift there as an owner action.

## Role hierarchy

Highest to lowest; array order in `blueprint.ts` is enforced by the planner.

| Role              | Guild-level permissions                                                                            | Assigned by     |
| ----------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| Owner             | Administrator                                                                                      | Owner           |
| Administrator     | Manage Server, Channels, Roles, Nicknames, Expressions; View Audit Log; Kick; Ban; Timeout members | Owner           |
| Developer         | —                                                                                                  | Owner / Admin   |
| Support Lead      | —                                                                                                  | Owner / Admin   |
| Support Staff     | —                                                                                                  | Owner / Admin   |
| Moderator         | Timeout members                                                                                    | Owner / Admin   |
| **KUSH Bot**      | see below (integration role)                                                                       | Discord install |
| Creative Partner  | —                                                                                                  | Bot (approved)  |
| Verified Reseller | —                                                                                                  | Bot (approved)  |
| Approved Seller   | —                                                                                                  | Bot (approved)  |
| Verified Customer | —                                                                                                  | Bot (backend)   |
| Beta Tester       | —                                                                                                  | Bot             |
| Member            | Send, threads (public), reactions, embeds, attachments, external emoji, change nickname            | Bot             |
| Restricted        | — (channel denies)                                                                                 | Bot / Moderator |

`@everyone` (unverified visitors): View Channels, Read Message History, Use Application Commands.

**Deviation from the requested list:** the bot sits **between Moderator and Creative Partner**, not at the bottom. Discord only lets a bot assign, remove or time out roles and members below its own highest role. It must be above the seven roles it manages, and below every human staff role so it can never grant or moderate staff.

## Bot permissions

Discord only lets a bot set overwrite bits and role permissions that it holds itself. `requiredBotPermissions` is therefore the union of every bit the blueprint writes, and a test enforces this. Integer **`4012652989115472`**:

View Channels, Read Message History, Send Messages, Send in Threads, Create Public/Private Threads, Embed Links, Attach Files, Add Reactions, External Emoji/Stickers, Voice Messages, Polls, Use Application Commands, Use External Apps, Manage Messages, Pin Messages, Manage Threads, Manage Channels, Manage Roles, Timeout Members, Change Nickname.

Never granted (tested): Administrator, Manage Server, Mention Everyone, Manage Webhooks, Kick, Ban. The participation bits are only there so the bot can write Restricted denies; they carry no extra risk because the bot is first-party code. AutoMod configuration needs Manage Server and remains a human administrator task.

Gateway intents: `Guilds` today. `!` prefix commands will need the privileged **Message Content** intent and `GuildMessages`. Enabling that in the Developer Portal is an owner action and has not been done.

## Ticket and report channels

Created at runtime under the private TICKETS and REPORTS categories via `ticketChannelOverwrites()`:

| Principal                | Support ticket          | Moderation report |
| ------------------------ | ----------------------- | ----------------- |
| `@everyone`              | deny View               | deny View         |
| Creator (member)         | View, Send, attach      | View, Send        |
| Assigned staff (members) | View, Send, attach      | —                 |
| Support Lead (role)      | View, Send              | —                 |
| Moderator, Administrator | —                       | View, Send        |
| KUSH Bot                 | View, Send, manage msgs | same              |

Support Staff see a ticket only when assigned. Other customers, unassigned staff and moderators cannot see support tickets; support staff cannot see reports. A restricted creator can still reply in their own ticket, because member overwrites apply last. That is the appeal path. Discord visibility is presentation only: the KUSH API rechecks link, tenant membership, ownership or assignment, and record version on every operation.

## Command authorisation (target)

| Command group                                                          | Minimum authority                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `!help !products !status !faq !rules !support !ticket !partner !apply` | Member                                                 |
| `!account !licenses !downloads !guide`                                 | Linked account; results only for the caller, privately |
| `!tickets !claim !note !priority !transcript !close !reopen`           | Support Staff for assigned tickets; Support Lead all   |
| `!assign`                                                              | Support Lead                                           |
| `!report`                                                              | Member                                                 |
| `!warn !timeout !case`                                                 | Moderator; target below actor and bot                  |
| `!config !permissions !health !sync !entitlement grant/revoke`         | Administrator (`!sync` apply additionally owner)       |

Every handler checks authority itself; command visibility is not authorisation. Guild roles alone never grant KUSH backend tenant access.

## Live acceptance checklist

Use controlled test accounts with combined roles in the approved guild. Record guild ID, role and channel IDs, principal, expected vs actual, timestamp and reviewer. A green unit test is not live proof.

- Visitor and Member read information channels; cannot send, create threads or send in threads.
- Member writes only in COMMUNITY.
- Customer reads `#downloads`/`#setup-guides`; cannot post there; cannot see staff, owner or partner programme channels.
- Partner programmes are mutually isolated.
- Moderator: moderation-log and community moderation; no ticket queue, downloads or owner channels.
- Support Staff: ticket-queue; tickets only when assigned; no reports, moderation-log or owner channels.
- Developer: bot-log, operational-alerts, releases, beta; no owner, moderation or ticket channels.
- Administrator cannot see `#owner-operations` or `#confidential-partnerships`.
- Restricted (after the strip) cannot participate anywhere except their own ticket; timed-out members cannot send.
- Two customers cannot see each other's tickets.
- Bot cannot see owner-only channels, mention everyone, or manage roles above it.
