# KUSH server blueprint (v2)

Source of truth: `apps/discord-bot/src/blueprint.ts`. Permission rules: [PERMISSIONS.md](PERMISSIONS.md). Generated access table: [PERMISSION-MATRIX.md](PERMISSION-MATRIX.md).

Status: implemented and tested offline. **Not applied to any live guild.** A v1 layout was applied to guild `1560640601676845146` on 17 October 2026 by `.local/apply-discord.mjs`; see "Live guild state" below.

## Categories and channels

| Category     | Channels                                                                     | Profile                                          |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| INFORMATION  | welcome, rules, announcements, getting-started, status                       | Read-only; named publishers                      |
| COMMUNITY    | general, introductions, development, showcases, suggestions                  | Member writes; Moderator/Admin moderate          |
| KUSH STUDIO  | services, commission-enquiries                                               | Read-only                                        |
| PRODUCTS     | products, releases, known-issues                                             | Read-only                                        |
| PRODUCTS     | downloads, setup-guides                                                      | Private: customers + support read; links via bot |
| PRODUCTS     | beta-programme                                                               | Private: Beta Tester + Developer                 |
| SUPPORT      | create-ticket, faq                                                           | Read-only; Restricted may still use the button   |
| PARTNERSHIPS | partner-information                                                          | Read-only; applications via private modal        |
| PARTNERSHIPS | reseller-programme, seller-programme, creative-partners                      | Private per programme                            |
| STAFF        | staff-chat, ticket-queue, moderation-log, bot-log, operational-alerts        | Private, per-channel staff roles                 |
| OWNER        | owner-operations, security-events, infrastructure, confidential-partnerships | Private; two channels exclude the bot            |
| TICKETS      | (bot-created per ticket)                                                     | Creator, assignees, Support Lead                 |
| REPORTS      | (bot-created per report)                                                     | Creator, Moderator, Administrator                |

## Consolidations (deliberate, reversible)

The directive asked to consolidate redundant channels and avoid empty ones. These merges are judgement calls. Each is a one-line change in `blueprint.ts` if you want the channel back.

| Requested                                                         | Now                                         | Why                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| development + software-discussion                                 | `#development`                              | Same audience and topic                                                 |
| services, website-development, custom-software, creative-services | `#services`                                 | One read-only post each would be near-empty channels                    |
| releases + changelogs                                             | `#releases`                                 | Release notes are the changelog                                         |
| support-information + faq                                         | `#faq`                                      | Same content                                                            |
| support-updates                                                   | `#status`                                   | Incident/maintenance updates belong with status                         |
| applications                                                      | `!apply` / button in `#partner-information` | Applications must be private; a public channel would only hold a button |
| owner-operations + business-administration                        | `#owner-operations`                         | Same single reader (Owner)                                              |
| —                                                                 | `#creative-partners` added                  | Creative Partner role needed its own programme space                    |

Voice channels and v1 notification roles are not in v2. Any that already exist are preserved and reported as unmanaged.

## Provisioning workflow

```
pnpm --filter @kush/discord-bot discord:inspect             # LIVE read-only snapshot + plan
pnpm --filter @kush/discord-bot discord:setup               # offline plan from that snapshot
pnpm --filter @kush/discord-bot exec tsx src/cli.ts setup --apply --confirm-guild <id> --plan-hash <hash>
```

- **Resolution:** stable IDs from `.local/discord.json` (v2 key, then v1 legacy keys), then a unique name match. v1 resources are adopted and renamed, never duplicated.
- **Drift:** names, topics, parents and exact overwrite sets. An unresolvable principal counts as drift. (Regression fix: the v1 planner treated it as a match, so it could never detect the empty overwrites v1 applied.)
- **Hierarchy:** roles at or above the bot, or needing bits the bot lacks, become owner actions ("Move role X above KUSH Bot"), never failed API calls.
- **Exposure:** the evaluator marks managed channels that members can currently see but should not (`exposure: true`), and unmanaged channels visible to members. `--restrict-unmanaged` proposes an `@everyone` view deny for the latter. Nothing is ever deleted.
- **Apply:** gated by `--confirm-guild` and the reviewed plan hash; config backed up to `.local/backups/`; stops at the first error and persists the partial mapping; re-plans afterwards. Repeat apply yields no operations, which is tested against the fake guild.

## Live guild state (needs owner attention)

`.local/apply-discord.mjs` applied v1 with `permissionOverwrites: []` for every category and for every staff and management channel. If nothing changed it afterwards, STAFF OPERATIONS and MANAGEMENT channels (including `financial-planning`, `security-alerts` and `audit-log`) are **visible to every member**. Verify with the read-only `discord:inspect`. The v2 apply fixes the managed channels; `--restrict-unmanaged` locks the leftover v1 channels.
