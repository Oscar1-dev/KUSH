# Legacy channel audit — 17 October 2026

Status: **proposal for owner approval. Nothing has been changed.**

Evidence: the bot read up to 100 messages and the pins of every channel outside blueprint v2 (`.local/legacy-audit.json`). Every legacy channel is **empty** except `#staff-tasks`, which only holds the engineering agent's own test commands. No member content, pins or bot dependencies exist in any of them. None is referenced by the bot's configuration or content.

## Proposed actions

**Adopt** = brought into the blueprint (renamed if needed, given blueprint permissions, managed from then on). **Archive** = moved into one private `ARCHIVE` category (owner and bot only). Nothing is deleted; archived channels can be restored by moving them back.

### Public channels (visible to members today)

| Channel                   | Category     | Proposal                                | Reason                                                                          |
| ------------------------- | ------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| `#off-topic`              | COMMUNITY    | **Adopt** (community)                   | Normal community chat; directive keeps general chat areas                       |
| `#media`                  | COMMUNITY    | **Adopt** (community)                   | Image/clip sharing separate from showcases                                      |
| `#feedback`               | COMMUNITY    | **Archive**                             | Duplicate of `#suggestions` (rename that to `#suggestions-and-feedback`)        |
| `#polls`                  | COMMUNITY    | **Archive**                             | Polls work in any community channel                                             |
| `#feature-requests`       | PRODUCTS     | **Archive**                             | Duplicate of suggestions                                                        |
| `#bug-reports`            | PRODUCTS     | **Archive**                             | Bugs go to a private _Product bug_ ticket; public confirmed bugs → known-issues |
| `#product-announcements`  | PRODUCTS     | **Archive**                             | Duplicate of `#releases`                                                        |
| `#development-progress`   | PRODUCTS     | **Archive**                             | Covered by `#releases` and `#development`                                       |
| `#commission-information` | KUSH STUDIO  | **Archive**                             | Duplicate of `#services` + `#commission-enquiries`                              |
| `#pricing-and-quotes`     | KUSH STUDIO  | **Archive**                             | Pricing is not validated; quotes are private                                    |
| `#commission-showcase`    | KUSH STUDIO  | **Adopt → `#portfolio`**                | Directive asks for "Portfolio and completed work"                               |
| `#customer-reviews`       | KUSH STUDIO  | **Archive**                             | No genuine reviews exist; fabricating any is not acceptable                     |
| `#marketplace`            | PARTNERSHIPS | **Archive**                             | Marketplace does not exist yet                                                  |
| `#featured-products`      | PARTNERSHIPS | **Archive**                             | No products yet                                                                 |
| `#marketplace-support`    | PARTNERSHIPS | **Archive**                             | Support goes through tickets                                                    |
| `#seller-applications`    | PARTNERSHIPS | **Archive**                             | Applications are private forms, not a public channel                            |
| `#partner-applications`   | PARTNERSHIPS | **Adopt → `#applications`** (read-only) | Directive asks for an applications area: info + apply panel                     |
| `#support-centre`         | SUPPORT      | **Adopt → `#support-information`**      | Directive asks for support information / troubleshooting                        |
| `#resolved-issues`        | SUPPORT      | **Archive**                             | Resolution lives in private tickets                                             |
| `#roles`                  | INFORMATION  | **Archive**                             | No self-assignable roles exist in v2                                            |
| `#faq` (old)              | INFORMATION  | **Archive**                             | Duplicate of SUPPORT `#faq`                                                     |
| `Text channels`           | (category)   | **Archive**                             | Discord default category, now empty                                             |

### Voice — needs your decision

`General` (in `Voice channels`) and `General Lounge`, `Development Lounge`, `Community Hangout` (in `07 — COMMUNITY VOICE`) are empty. **Since the v2 apply, nobody except staff with explicit grants can join voice**, because `@everyone` lost Connect/Speak and Member does not grant them.

- **Option A (recommended): keep one voice channel.** Adopt `General Lounge` into COMMUNITY and give Member Connect/Speak/Stream/Voice Activity. The bot must hold those bits to write them, so its permissions gain Connect/Speak/Stream/Use Voice Activity (reauthorisation link, as before). Archive the other three voice channels and both voice categories.
- **Option B: no voice.** Archive all four and both categories.

### Staff and owner (already private — only you and the bot can see them)

| Channel                  | Proposal                                        | Reason                                         |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| `#commission-management` | **Adopt** (staff: Commission Manager scope)     | Directive asks for staff commission management |
| `#partner-management`    | **Adopt → `#recruitment-review`**               | Directive asks for recruitment review          |
| `#staff-announcements`   | **Archive**                                     | `#staff-chat` covers it                        |
| `#staff-tasks`           | **Archive**                                     | Only test commands                             |
| `#marketplace-review`    | **Archive**                                     | No marketplace yet                             |
| `#audit-log`             | **Archive**                                     | Duplicate of `#bot-log`                        |
| `#financial-planning`    | **Adopt → `#financial-operations`** (owner)     | Directive asks for financial operations        |
| `#business-planning`     | **Adopt → `#agreement-administration`** (owner) | Directive asks for agreement administration    |

## Effect

- Public channels drop from 28 legacy + v2 to v2 + 5 adopted; members see no empty legacy channels.
- 4 directive-requested areas are created by renaming empty channels instead of adding new ones.
- One new private `ARCHIVE` category holds 26 channels/categories (Option A) or 27 (Option B): 17 public, 4 staff, and the voice items. All reversible.

To approve, reply with **"approve legacy mapping, voice A"** (or **B**), plus any rows you want changed.
