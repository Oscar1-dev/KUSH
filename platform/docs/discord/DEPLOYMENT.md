# Discord deployment and live verification

This runbook separates safe local preparation from owner-approved live changes. A dry-run may inspect the target guild and produce a diff. Applying the diff, installing the application, registering guild commands, publishing panels, changing AutoMod, or sending messages is a live mutation and requires the owner's approval of the concrete target and diff.

## Prerequisites

- Confirm the signed-in Discord account controls the intended KUSH guild; record its guild ID.
- Create or select a first-party bot application owned by KUSH. Use a bot token, never a user token.
- Configure OAuth2 scopes `bot applications.commands` and review the permission set in `PERMISSIONS.md`; `Administrator` must be absent.
- Store `DISCORD_TOKEN`, application ID, guild ID, and KUSH bot service credentials in the protected host environment. Do not paste values into documentation or chat.
- Ensure the KUSH API, migrations, backup rehearsal, and complete automated test suite pass first.
- Create a configuration backup containing IDs and non-secret settings only.

## Deployment sequence

1. Run validation without a token where supported: schema, unique stable keys, role hierarchy, overwrite profiles, command policy, and panel references.
2. Run an authenticated read-only dry-run against the exact guild. Capture creates, safe updates, conflicts, unknown resources, role-position problems, and required permissions.
3. Review the diff with the owner. Preserve all unknown roles, channels, messages, members, invites, integrations, and audit history.
4. Install the application with the reviewed OAuth scopes and permission integer. Confirm the actual bot role has no Administrator or Manage Guild.
5. Apply reconciliation once. Abort on a guild-ID mismatch, missing ownership/authority, role ceiling conflict, or unexpected destructive operation.
6. Run dry-run again. Expected result is no changes. A nonempty second diff is a launch blocker.
7. Register guild-scoped commands for testing. Global command registration waits until acceptance because propagation and public impact are broader.
8. Publish only the reviewed onboarding, roles, service, support, commission, marketplace, partner, and status panels. Do not mass announce or invite users.
9. Configure Discord-native AutoMod conservatively and route alerts to the restricted moderation log. Discord requires `Manage Guild` for AutoMod API operations, so use an authorised human administrator or a separately approved temporary provisioner and revoke that permission after applying the reviewed rules.
10. Exercise the live checklist with controlled owner, management, staff, member, and two customer test identities. Remove test records and temporary access through the approved cleanup path.

## Live verification record

Record actual result, timestamp, tester identity, stable Discord IDs, and evidence location for every row. Mark blocked or failed rather than inferring success.

| Gate                  | Required result                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Guild identity        | Connected guild ID exactly matches approved KUSH tenant mapping                                 |
| Reconciliation        | First apply matches reviewed diff; second dry-run is empty; unknown resources preserved         |
| Bot privilege         | No Administrator/Manage Guild/Mention Everyone; role below protected human roles                |
| Information channels  | Member views and reads history; cannot send, create threads, or send in threads                 |
| Community channels    | Member can use intended text/forum actions; spam and mention rules trigger proportionately      |
| Staff and management  | Ordinary member sees neither; ordinary staff sees no management/financial/security channel      |
| Notification roles    | Only allowlisted opt-in roles can be self-assigned; protected roles rejected                    |
| Ticket creation       | Modal creates one M3 backend ticket and returns the same reference on retry                     |
| Ticket privacy        | Customer A cannot view/list/export Customer B's ticket; unassigned staff denied                 |
| Ticket lifecycle      | Claim/assign/reply/priority/close/reopen persist and appear in desktop against the same record  |
| Internal notes        | Never appear in customer channel, customer command response, or customer transcript             |
| Transcript            | Authorised ephemeral/download flow works; unauthorised, expired, and replay access fail         |
| Account linking       | Codes are short-lived and single-use; wrong Discord identity and reuse fail                     |
| Commission            | Request persists privately; no automatic promise of price, date, or acceptance                  |
| Marketplace/partner   | Applicant sees own state; only reviewer role can approve/reject; publication follows approval   |
| Moderation            | Member denied; hierarchy protected; reason and explicit confirmation recorded                   |
| API failure           | Interaction gives a safe ephemeral error; no duplicate record or private data in logs           |
| Discord 429/reconnect | Backoff/reconnect succeeds without duplicate notifications or commands                          |
| Restart               | Configuration mapping and pending work recover; backend records remain authoritative            |
| Backup                | Configuration backup contains no token, webhook, customer message, or credential                |
| Accessibility         | Labels are descriptive; state is not conveyed by colour/emoji alone; keyboard interaction works |

## Rollback

Stop the bot first to prevent reconciliation during rollback. Restore the last non-secret configuration mapping and revert only resources that the approved apply created or changed and whose IDs are recorded. Never mass-delete categories or roles. Preserve backend business records and Discord audit history. If permissions might expose private data, deny public access to the affected category immediately, rotate credentials if relevant, and inspect audit events before resuming.

No public launch, invites, mass announcement, or global-command promotion occurs until all launch gates pass and the owner separately authorises launch.
