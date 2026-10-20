# Discord overhaul (blueprint v3), 20 Oct 2026

Audit of the live server, what changes, and how it's applied safely. The
full generated per-channel matrix is in [PERMISSION-MATRIX.md](PERMISSION-MATRIX.md).

## 1. Audit (live, read-only)

Taken with `cli.ts inspect` and a read-only member count. Nothing was changed.

- **Members:** 3 (2 people + the KUSH bot). Owner holds Owner (+ a leftover TEST role); one member holds Member.
- **Drift:** none. The server matched blueprint v2 exactly; no private channel was visible to members.
- **Bot role:** position 20 of 29, *below* every staff role, so the bot could not keep staff roles tidy.
- **Risky roles:** `Co-Owner` and `Management` carried **Administrator** with no holders (dormant admin roles).
- **Roles outside the blueprint (15):** Co-Owner, Management, Commission Manager, Marketplace Reviewer, Partner Manager, Official Partner, Premium Customer, Contributor, five ping roles, two `TEST product access`.
- **API mappings** (`staff_role_mappings`): Management and Commission Manager → manager; Support Lead and Support Staff → support; Co-Owner and Administrator → administrator. Role IDs, not names, are what the API uses, so renames are safe.

## 2. Role hierarchy (after)

Top to bottom. Existing role IDs are kept wherever a role carries on, so
logins, staff access and current members are unaffected.

| Role | Colour | Hoisted | Discord permissions | Was |
| --- | --- | --- | --- | --- |
| Owner | #CBBCFF | ✓ | Administrator | Owner |
| Administrator | #A78BFA | ✓ | Administrator | Administrator |
| KUSH Bot | (integration) | | Bot set only (no Administrator, ban, kick, webhooks) | KUSH, moved up |
| ─── Staff ─── | none | | none | new divider |
| Staff Manager | #818CF8 | ✓ | none (channel access only) | **Management** (same ID; Administrator removed) |
| Developer | #7DD3FC | ✓ | none | Developer |
| Ticket Staff | #5EEAD4 | ✓ | none | **Support Staff** (same ID) |
| Moderator | #86EFAC | ✓ | Timeout members | Moderator |
| ─── Partners ─── | none | | none | new divider |
| Creative Team | #F9A8D4 | ✓ | none | Creative Partner |
| Verified Seller | #FCD34D | ✓ | none | Approved Seller |
| Reseller | #FDBA74 | ✓ | none | Verified Reseller |
| ─── Community ─── | none | | none | new divider |
| Customer | #A7FA43 | ✓ | none | Verified Customer |
| Beta Tester | #93C5FD | | none | Beta Tester |
| Member | #D4D4D8 | | send, react, attach, threads, nickname | Member |
| Restricted | #71717A | | none (channel denies) | Restricted |
| ─── Notifications ─── | none | | none | new divider |
| Announcements · Product Updates · Development Updates · Community Events | none | | none | existing ping roles, now opt-in from #roles |

**Least privilege:** only Owner and Administrator hold Administrator. Staff
roles get access through channel overwrites, not server permissions.
Dividers and ping roles hold nothing. The bot never assigns staff roles; it
only assigns Member, Customer, programme roles (when staff grant them) and
opt-in ping roles.

**Retired** (deleted only after review, `cli.ts retire-roles`): Co-Owner,
Support Lead (merged into Staff Manager), Commission Manager, Marketplace
Reviewer, Partner Manager, Official Partner, Premium Customer, Contributor,
Marketplace Updates, and both `TEST product access`. All have no holders
except one TEST role, a leftover from automated tests.

## 3. Channel permissions

Unchanged in shape (already least-privilege); Staff Manager replaces
Support Lead everywhere and also gets #commission-management and
#recruitment-review.

| Area | View | Read history | Send | Threads | Use commands | Manage messages |
| --- | --- | --- | --- | --- | --- | --- |
| Information, Studio, Products (announcements, services, guides) | everyone | everyone | named publishers only | no | everyone (not Restricted) | publishers |
| Community (general, showcases, feedback…) | everyone | everyone | Members | Members | Members | Moderators, Administrators |
| Support (create-ticket, faq) | everyone | everyone | Staff Manager posts | no | everyone, incl. Restricted (appeals) | Staff Manager |
| Customer resources (downloads, setup guides) | Customer, Staff Manager, Ticket Staff | same | Developer, Staff Manager | no | same | publishers |
| Programme channels | that programme + Administrator | same | same | no | same | — |
| Staff | staff roles | same | staff roles | staff roles | staff roles | per channel |
| Tickets | creator, assignee, added people, Staff Manager | same | same | no | same | bot |
| Reports | Moderator, Administrator | same | same | no | same | bot |
| Owner | owner-only; some bot-excluded ("observe") | — | — | — | — | — |

Manage channels: the bot and Administrators only. Restricted members lose
every participation bit in public channels but keep ticket access.

## 4. Navigation

- Categories reordered to follow a visitor: Information → KUSH Studio →
  Support → Products → Community → Partnerships → Staff → Tickets → Reports → Owner.
- #welcome gets a **Find your way** menu (answers privately with the right
  channels and an action button).
- #roles explains every role and lets members toggle notification pings.
- Every pinned post is rewritten in one house style (see `src/ui/kit.ts`).

## 5. Applying it (owner steps, in order)

Nothing below has been run against the live server yet.

1. **Server Settings → Roles:** drag **KUSH** to directly under **Administrator**.
2. Same page: open **Management** and switch off **Administrator** (the bot
   cannot remove a permission it doesn't hold).
3. Optional: recolour **Owner** and **Administrator** (above the bot):
   #CBBCFF and #A78BFA.
4. Dry run and review: `pnpm --filter @kush/discord-bot exec tsx src/cli.ts inspect`
   then apply with the printed hash:
   `tsx src/cli.ts setup --apply --confirm-guild <guild> --plan-hash <hash>`.
5. Retire old roles: `tsx src/cli.ts retire-roles` (dry run), then
   `--apply --confirm-guild <guild> --plan-hash <hash>`. Co-Owner, Support Lead
   and Commission Manager sit above the bot until step 1, or delete them by hand.
6. Republish channel posts: `tsx src/cli.ts content` (plan) then `content --publish --confirm-guild <guild>`.
7. Register slash commands: `tsx src/cli.ts register-commands`.
8. Restart the bot so it loads the new role IDs.
