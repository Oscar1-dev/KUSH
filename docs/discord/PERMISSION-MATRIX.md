<!-- Generated from apps/discord-bot/src/blueprint.ts (v3). Do not edit by hand. -->

# KUSH Discord permission matrix

Computed by the effective-permission evaluator (`src/permissions.ts`) from blueprint v3. `M` manage messages, `W` send, `R` view and read only, `·` no access. The guild owner account and the Owner role (Administrator) bypass every overwrite.

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
| staff/#commission-management | · | · | · | · | · | · | · | · | · | · | · | R | R | M | M | M |
| staff/#recruitment-review | · | · | · | · | · | · | · | · | · | · | · | R | · | M | M | M |
| information/#roles | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| information/#server-faq | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| community/#feedback | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#polls | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| community/#vouches | R | R | R | R | R | R | R | R | R | M | R | R | R | M | M | M |
| community/#General Lounge | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| products/#product-announcements | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M | M |
| products/#development-updates | R | R | R | R | R | R | R | R | R | R | R | R | W | M | M | M |
| products/#feature-requests | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| products/#bug-reports | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| studio/#commission-information | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| studio/#pricing-and-quotes | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| studio/#customer-reviews | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| partnerships/#marketplace | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| partnerships/#featured-products | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| partnerships/#seller-applications | R | R | R | R | R | R | R | R | R | R | R | R | R | M | M | M |
| partnerships/#marketplace-support | R | W | R | R | W | W | W | W | W | M | W | W | W | M | M | M |
| support/#resolved-issues | R | R | R | R | R | R | R | R | R | R | R | W | R | M | M | M |
| staff/#staff-announcements | · | · | · | · | · | · | · | · | · | R | R | R | R | M | M | M |
| staff/#staff-tasks | · | · | · | · | · | · | · | · | · | W | W | W | W | M | M | M |
| staff/#marketplace-review | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
| staff/#audit-log | · | · | · | · | · | · | · | · | · | · | · | · | · | M | M | M |
