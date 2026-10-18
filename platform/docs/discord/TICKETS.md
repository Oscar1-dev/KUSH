# KUSH private ticket system

Backend: `services/api/src/discord.ts`, `discord-service.ts`, `support-service.ts` (PostgreSQL, migration 0008). Bot: `apps/discord-bot/src/tickets/`.

## Flow

1. A member types `!ticket`, `/ticket` or presses the support panel button. They choose a category from an ephemeral menu, then describe the issue in a modal. No purchase or KUSH account is needed.
2. The API resolves the member to a KUSH identity:
   - a verified account link if one exists;
   - otherwise a **Discord identity**: a customer-role user with `kind='discord'` and a password sentinel that `verifyPassword` always rejects, so it can never sign in.
   - Idempotent retries return the same ticket. At most 3 open tickets per member.
3. The bot creates a private channel `ticket-NNNN` (or `report-NNNN`) under TICKETS/REPORTS and records the mapping in `discord_ticket_channels`. It posts an intro mentioning only the creator, and a summary in `#ticket-queue` (reports: `#moderation-log`). The summary never includes the description.
4. Messages typed in the channel are stored as ticket replies, authored by the matching KUSH identity. Messages from members without access are refused, with a one-time notice.

## Access

| Who                     | Support ticket                     | Moderation report       |
| ----------------------- | ---------------------------------- | ----------------------- |
| Creator                 | read/write (read-only when closed) | read/write              |
| Assigned staff          | read/write                         | —                       |
| Support Lead role       | read/write                         | —                       |
| Moderator/Administrator | —                                  | read/write              |
| Support Staff (other)   | no access, even via API            | no access, even via API |
| Everyone else           | none                               | none                    |

Backend rules (authoritative):

- Staff see assigned tickets only and never see report categories.
- Moderators see report categories only and have no commercial-request access.
- Customers see their own tickets and never see internal notes or staff events.
- Assignment is tenant-owner only.

## Commands

| Command                          | Who                                    | Notes                                                                 |
| -------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `!tickets`                       | everyone                               | Own tickets; staff also see the unclaimed queue (summaries). Private. |
| `!claim [n]`                     | support staff, support lead, moderator | Claim race returns "already claimed".                                 |
| `!assign @staff\|none [n]`       | support lead (tenant owner in backend) |                                                                       |
| `!priority <level> [n]`          | ticket handlers                        |                                                                       |
| `!note [n] <text>`               | ticket handlers                        | Command message deleted at once; confirmation by DM only.             |
| `!close [n] <reason>`, `!reopen` | creator or handlers                    | Closed channels become read-only for participants.                    |
| `!transcript [n]`                | creator or handlers                    | Text file by DM / ephemeral; customers never receive notes.           |

Prefer `/note` in ticket channels: Discord may show a push notification for a `!note` message before the bot deletes it.

## Restart recovery

On ready the bot loads active mappings, re-applies access from backend state, and archives mappings whose channel no longer exists. It never silently recreates them.

## Verification (17 October 2026)

- Real PostgreSQL suite (`services/api/test/discord-tickets.test.ts`, 9 tests):
  - Guest identity creation and login refusal, idempotency and the open-ticket limit.
  - Channel privacy between customers.
  - The full staff lifecycle, with note isolation in transcripts.
  - Report isolation, owner-only assignment, recovery listing, and moderator commercial denial.
  - Claim by number and by channel.
- Bot suite: channel overwrites, report routing, reuse on retry, closed read-only, unresolved-role safety, recovery, commands and transcripts.
- **Live** in guild 1560640601676845146, with the local API and PostgreSQL:
  - A member without a KUSH account opened ticket #1 → private channel created; `@everyone`, Member, Support Staff, Moderator and Verified Customer had no access.
  - Customer reply stored; transcript received by DM; close → read-only and renamed; reopen.
  - With a labelled test staff identity (since revoked and disabled): claim, priority, staff reply stored as staff, and a note stored with its text never shown in the channel.
  - Bot restart → `tickets.recovered restored=1`.
- Live E2E found two bugs that the unit tests missed, both now fixed and regression-tested:
  - Unassigned staff could not claim by number or channel.
  - By-number routes failed validation, because the API disables Ajv type coercion.

Pending live items: the TICKETS/REPORTS categories and the Support Lead role exist only after the v2 apply. Until then ticket channels are top-level and private, and the Support Lead overwrite is skipped.
