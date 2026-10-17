<!-- Generated from apps/discord-bot/src/blueprint.ts (v2). Do not edit by hand. -->

# KUSH Discord permission matrix

Computed by the effective-permission evaluator (`src/permissions.ts`) from blueprint v2. `M` manage messages, `W` send, `R` view and read only, `·` no access. The guild owner account and the Owner role (Administrator) bypass every overwrite.

This is a model of the blueprint, not evidence of live guild state. Live verification is recorded separately (see DEPLOYMENT.md).

| Channel | @everyone (unverified) | Member | Restricted (after restriction) | Member (timed out) | Verified Customer | Beta Tester | Approved Seller | Verified Reseller | Creative Partner | Moderator | Support Staff | Support Lead | Developer | Administrator | Owner role | KUSH Bot |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| information/#do-not-post | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| information/#welcome | R | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M |
| information/#rules | R | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M |
| information/#announcements | R | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M |
| information/#getting-started | R | R | R | R | R | R | R | R | R | R | R | W | R | W | M | M |
| information/#status | R | R | R | R | R | R | R | R | R | R | R | W | W | W | M | M |
| community/#general | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#introductions | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#development | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#showcases | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#suggestions | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| studio/#services | R | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M |
| studio/#commission-enquiries | R | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M |
| products/#products | R | R | R | R | R | R | R | R | R | R | R | R | W | W | M | M |
| products/#releases | R | R | R | R | R | R | R | R | R | R | R | R | W | R | M | M |
| products/#known-issues | R | R | R | R | R | R | R | R | R | R | R | W | W | R | M | M |
| products/#downloads | · | · | · | · | R | · | · | · | · | · | R | W | W | · | M | M |
| products/#setup-guides | · | · | · | · | R | · | · | · | · | · | R | W | W | · | M | M |
| products/#beta-programme | · | · | · | · | · | W | · | · | · | · | · | · | M | · | M | M |
| support/#create-ticket | R | R | R | R | R | R | R | R | R | R | R | W | R | R | M | M |
| support/#faq | R | R | R | R | R | R | R | R | R | R | R | W | R | R | M | M |
| partnerships/#partner-information | R | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M |
| partnerships/#reseller-programme | · | · | · | · | · | · | · | W | · | · | · | · | · | W | M | M |
| partnerships/#seller-programme | · | · | · | · | · | · | W | · | · | · | · | · | · | W | M | M |
| partnerships/#creative-partners | · | · | · | · | · | · | · | · | W | · | · | · | · | W | M | M |
| staff/#staff-chat | · | · | · | · | · | · | · | · | · | W | W | W | W | W | M | M |
| staff/#ticket-queue | · | · | · | · | · | · | · | · | · | · | W | M | · | · | M | M |
| staff/#moderation-log | · | · | · | · | · | · | · | · | · | R | · | · | · | R | M | M |
| staff/#bot-log | · | · | · | · | · | · | · | · | · | · | · | · | R | R | M | M |
| staff/#operational-alerts | · | · | · | · | · | · | · | · | · | · | · | R | R | R | M | M |
| owner/#owner-operations | · | · | · | · | · | · | · | · | · | · | · | · | · | · | M | · |
| owner/#security-events | · | · | · | · | · | · | · | · | · | · | · | · | · | R | M | M |
| owner/#infrastructure | · | · | · | · | · | · | · | · | · | · | · | · | · | R | M | M |
| owner/#confidential-partnerships | · | · | · | · | · | · | · | · | · | · | · | · | · | · | M | · |
