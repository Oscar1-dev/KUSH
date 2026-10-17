<!-- Generated from apps/discord-bot/src/blueprint.ts (v2). Do not edit by hand. -->

# KUSH Discord permission matrix

Computed by the effective-permission evaluator (`src/permissions.ts`) from blueprint v2. `M` manage messages, `W` send, `R` view and read only, `·` no access. The guild owner account and the Owner role (Administrator) bypass every overwrite.

This is a model of the blueprint, not evidence of live guild state. Live verification is recorded separately (see DEPLOYMENT.md).

| Channel | @everyone (unverified) | Member | Restricted (after restriction) | Member (timed out) | Verified Customer | Beta Tester | Approved Seller | Verified Reseller | Creative Partner | Moderator | Support Staff | Support Lead | Developer | Administrator | Owner role | KUSH Bot |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| information/#do-not-post | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| information/#welcome | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| information/#rules | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| information/#announcements | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| information/#getting-started | R | R | R | R | R | R | R | R | R | R | R | W | R | M | M | M |
| information/#status | R | R | R | R | R | R | R | R | R | R | R | W | W | M | M | M |
| community/#general | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#introductions | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#development | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#showcases | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#suggestions | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| studio/#services | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| studio/#commission-enquiries | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| products/#products | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M | M |
| products/#releases | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M | M |
| products/#known-issues | R | R | R | R | R | R | R | R | R | R | R | W | W | M | M | M |
| products/#downloads | · | · | · | · | R | · | · | · | · | · | R | W | W | M | M | M |
| products/#setup-guides | · | · | · | · | R | · | · | · | · | · | R | W | W | M | M | M |
| products/#beta-programme | · | · | · | · | · | W | · | · | · | · | · | · | M | M | M | M |
| support/#create-ticket | R | R | R | R | R | R | R | R | R | R | R | W | R | M | M | M |
| support/#faq | R | R | R | R | R | R | R | R | R | R | R | W | R | M | M | M |
| partnerships/#partner-information | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| partnerships/#reseller-programme | · | · | · | · | · | · | · | W | · | · | · | · | · | M | M | M |
| partnerships/#seller-programme | · | · | · | · | · | · | W | · | · | · | · | · | · | M | M | M |
| partnerships/#creative-partners | · | · | · | · | · | · | · | · | W | · | · | · | · | M | M | M |
| staff/#staff-chat | · | · | · | · | · | · | · | · | · | W | W | W | W | M | M | M |
| staff/#ticket-queue | · | · | · | · | · | · | · | · | · | · | W | M | · | M | M | M |
| staff/#moderation-log | · | · | · | · | · | · | · | · | · | R | · | · | · | M | M | M |
| staff/#bot-log | · | · | · | · | · | · | · | · | · | · | · | · | R | M | M | M |
| staff/#operational-alerts | · | · | · | · | · | · | · | · | · | · | · | R | R | M | M | M |
| owner/#owner-operations | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | · |
| owner/#security-events | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| owner/#infrastructure | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| owner/#confidential-partnerships | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | · |
| community/#off-topic | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#media | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| studio/#portfolio | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M | M |
| partnerships/#applications | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| support/#support-information | R | R | R | R | R | R | R | R | R | R | R | W | R | M | M | M |
| staff/#commission-management | · | · | · | · | · | · | · | · | · | · | · | · | R | M | M | M |
| staff/#recruitment-review | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#roles | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#faq-old | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#feedback | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#polls | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#product-announcements | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#development-progress | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#feature-requests | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#bug-reports | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#commission-information | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#pricing-and-quotes | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#customer-reviews | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#marketplace | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#featured-products | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#marketplace-support | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#seller-applications | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#resolved-issues | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#staff-announcements | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#staff-tasks | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#marketplace-review | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#audit-log | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#development-lounge | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| archive/#community-hangout | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
