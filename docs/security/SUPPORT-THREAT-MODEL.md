# Local support slice threat model

Scope: authenticated local Fastify/PostgreSQL ticket APIs and desktop. This is a design and source review, with executable acceptance cases in `services/api/test/support.test.ts`; executed results belong in STATUS.md. No live Discord security verification is implied.

## Assets and boundaries

Private customer messages, internal notes, tenant membership, client/project associations and audit metadata are protected assets. The API is authoritative. Neither desktop controls, a supplied tenant UUID, a global administrator role, nor future Discord channel visibility proves ticket access.

Missing tenant membership and inaccessible tickets return the same 404 response as absent resources, including for global administrators. A 403 response is reserved for a prohibited operation on a resource the caller is already permitted to access. Automated assertions deliberately preserve that concealment contract.

| Threat                                        | Required control                                                          | Acceptance                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cross-tenant UUID substitution                | Membership required for every tenant route; composite tenant foreign keys | Other tenant and global administrator without membership rejected |
| Customer reads other customer's ticket        | Customer identity from authenticated session; own-ticket filtering        | List/detail/transcript exclude unrelated tickets                  |
| Customer reads business administration        | Dedicated global customer account and global API route guard              | Clients/projects/profiles/activity/audit/admin rejected           |
| Unassigned or revoked staff reads tickets     | Assigned-ticket access checked on every request                           | Access and writes revoked immediately after reassignment          |
| Global viewer upgraded through tenant role    | Owner/staff require enabled global operator/admin                         | Viewer and disabled assignment rejected                           |
| Internal note leaks in reply/transcript/event | Separate note kind and staff event audience; server filtering             | Customer detail/export omit note body and staff events            |
| Retried action duplicates messages/tickets    | Actor-scoped UUID request keys and payload comparison                     | Same request is stable; changed payload returns conflict          |
| Lost update                                   | Expected version checked in transactional mutation                        | Stale message/update rejected                                     |
| Forged installation relationship              | Validate project belongs to selected client                               | Mismatched client/project rejected                                |
| Guild claimed by multiple tenants             | Unique validated snowflake; unverified status                             | Duplicate and malformed guild IDs rejected                        |
| Audit side channel                            | Tenant scope on mutations; root audit/activity exclude scoped rows        | Root routes cannot return support audit metadata                  |
| Unintended closure or reopen                  | Explicit confirmation/reason; reopen policy                               | Invalid closure and policy-disallowed reopen rejected             |

## Residual risks and deferred controls

Source review identified three first-slice regressions requiring explicit controls and tests: the full tenant account/email roster was available to assigned staff; staff-created tickets could become unreadable immediately or leak metadata through request replay after reassignment; and category edits changed the values used to compare the original ticket-creation payload. The intended controls are owner-only membership listing, automatic self-assignment for staff-created tickets, authorization before creation replay, and an immutable original creation category. The regression suite covers these cases; consult STATUS.md for actual execution evidence rather than treating source review as proof of correctness.

Guild IDs are local configuration claims, not proof of Discord ownership. A bot adapter must verify guild access and installation authorisation before reporting connected or applying changes. There is no token field or arbitrary Discord API execution in this slice.

Database owners and the signed-in machine owner remain trusted. Current session authentication has no MFA. Local services must bind loopback; public deployment needs TLS, operational monitoring, abuse controls and a separate production review. Application administrators manage accounts; a deliberately malicious administrator able to alter credentials is outside customer isolation against ordinary API requests.

Retention configuration records intent only. No automatic deletion, archival scheduler, external transcript URL or claim of retention enforcement is permitted. JSON export contains personal data and must be stored by the operator with appropriate access and agreed retention. Display untrusted content as text; future HTML export requires escaping and active-content prohibition.

Ticket and message request keys are scoped to the authenticated actor and tenant (and ticket for messages). Replays preserve the existing record and do not append duplicate events; message replay returns the ticket's current state. Assignment/access checks still run before replay, so a revoked staff member cannot use an old request key to retrieve a ticket. Ticket closure and reopening require optimistic versions; closure also requires an explicit true confirmation and a nonblank reason. Customers may close and, when tenant policy allows, reopen their own tickets.

Discord permission overwrites, role hierarchy, privileged intents, reconnect reconciliation, rate limits, bot credentials and authenticated bot-to-API communication require tests when the adapter exists. They remain unimplemented; no mock result can substitute for live permission review in an authorised test server.
