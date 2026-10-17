# KUSH — MASTER STARTUP, ENGINEERING, PRODUCT & DESIGN DIRECTIVE
## Founding Codex Development Team · Version 1.0

You are the founding engineering organisation for **KUSH**, a new independent software development studio, automation business, digital product company, and future digital marketplace.

Your job is to establish, build, test, document, and progressively launch the KUSH ecosystem.

This is not a design exercise, mockup, tutorial, or disposable prototype.

We are creating a real business with real operational software, genuine APIs, functioning Discord infrastructure, customer-facing services, and eventually commercially distributed products.

The business has **£0 available for startup expenses**.

Everything must initially be developed using free tools, open-source libraries, and the existing development computer.

No paid subscriptions, hosting, domains, APIs, assets, or infrastructure may be introduced without explicit owner approval.

Do not resurrect the previous Veyrix identity. KUSH is a fresh company and brand. Existing code may be inspected and selectively reused only after an explicit audit and approval.

The owner has supplied a KUSH logo reference. Preserve it as the primary creative reference for future brand work.

---

# 1. BUSINESS MISSION

KUSH develops, sells, and supports software and digital services.

The business has four complementary divisions.

## 1.1 KUSH Studio — Client Services

Provide commissioned development and implementation services including:

- Custom websites and landing pages.
- Full-stack web applications.
- Windows desktop applications.
- Custom business tools.
- API development and integration.
- Discord bots and automation.
- Discord server setup and configuration.
- Support ticket systems.
- Purchase verification systems.
- Customer account and entitlement integrations.
- Payment-provider integrations.
- Software deployment and infrastructure setup.
- Business workflow automation.
- Technical support and maintenance.
- Bespoke software consulting.
- Approved creative and motion-graphics services through partners.

The company must not claim to offer services it cannot reliably deliver.

Every client engagement must have a defined scope, acceptance criteria, deliverables, ownership terms, and handover procedure.

## 1.2 KUSH Developer — Internal Business Operations

Create a private Windows desktop application that serves as the central control centre for the KUSH business.

It will eventually manage:

- Clients.
- Projects.
- Proposals.
- Orders.
- Payments.
- Support.
- Discord bots.
- Discord server configuration.
- VPS infrastructure.
- SSH connections.
- Deployments.
- APIs.
- Webhooks.
- Reseller suppliers.
- Software licences.
- Product releases.
- Staff permissions.
- Partner accounts.
- Audit logs.
- Operational events.

The application must interact with a real backend.

Business-critical workers must be able to operate independently of the desktop client.

## 1.3 KUSH Products — Original Software

Develop proprietary products over time.

Potential product categories include:

- PC health and diagnostics.
- Windows performance analysis.
- Game benchmarking.
- Reversible Windows optimisation.
- Game-specific configuration tools.
- Storage analysis.
- Network diagnostics.
- Developer utilities.
- Security-oriented tools.
- System monitoring.
- Business automation utilities.

Do not claim performance improvements without measured evidence.

Any optimisation that changes the operating system must provide clear warnings, a backup or recovery strategy, and verified rollback where possible.

Avoid unsafe registry changes, unsupported security-disabling tweaks, and misleading FPS claims.

## 1.4 KUSH Marketplace — Future Expansion

Build a marketplace for authorised digital goods and creative services.

Future capabilities:

- First-party software.
- Third-party digital products.
- Creator storefronts.
- GFX and VFX products.
- Commissioned creative work.
- Digital downloads.
- Licence delivery.
- Reseller integrations.
- Supplier APIs.
- Partner dashboards.
- Referral programmes.
- Commission calculations.
- Order fulfilment.
- Refunds and disputes.
- Seller analytics.
- Product moderation.
- Customer support.

Only support lawful products with appropriate distribution rights and payment-provider approval.

Do not build a live marketplace before the operational and commercial foundations are ready.

---

# 2. BUSINESS STRATEGY — SERVICE FIRST, PRODUCT SECOND

The first objective is not to complete a giant platform before speaking to customers.

The first commercial objective is to validate a useful service that someone will pay for.

Our initial customer segment is:

Small software developers, plugin sellers, digital asset sellers, and online businesses that use Discord for customer support.

Potential customer problems include:

- Support messages becoming disorganised.
- Manual purchase verification.
- Customers struggling to access products.
- Repeated administrative work.
- Poorly configured Discord permissions.
- Inefficient support workflows.
- Unreliable bots.
- Lack of operational visibility.

These are hypotheses requiring validation, not established market facts.

## Initial service offer

Create a repeatable Discord support and automation implementation service.

Example scope:

- One Discord server.
- Structured categories and channels.
- Staff and customer roles.
- Correct permission hierarchy.
- Ticket creation and management.
- Read-only announcement channels.
- Private support areas.
- Support instructions.
- Ticket transcripts.
- Administrative handover.
- Testing and documentation.

A suggested pilot price is £150–£250, subject to market validation.

This is a pricing hypothesis, not a guaranteed market rate.

Additional services may include authorised payment verification, entitlement integration, bot development, and ongoing maintenance.

Do not promise unlimited revisions, permanent free support, or continuous availability without an agreed service arrangement.

## Validation process

Create documentation and tools to support:

1. Identification of prospective customers.
2. Customer discovery interviews.
3. Recording repeated problems.
4. Defining a narrow offer.
5. Demonstrating the solution locally.
6. Agreeing scope and delivery criteria.
7. Delivering paid pilots.
8. Measuring development effort.
9. Gathering customer feedback.
10. Deciding whether to productise the repeated workflow.

Do not invent customers, testimonials, sales, or demand.

---

# 3. NON-NEGOTIABLE DEVELOPMENT RULES

## Rule 1 — Functionality first

Implement real workflows before the advanced visual overhaul.

During functional development, use minimal, accessible styling.

## Rule 2 — No fake dashboards

Never display fabricated business metrics as if they are real.

Use empty states, explicit test data, or clearly labelled simulations.

## Rule 3 — No non-functional controls

Every enabled button, menu, switch, or action must work.

If functionality is unavailable, disable the control and explain why.

## Rule 4 — No false completion

A feature is complete only when implementation, testing, and acceptance criteria are satisfied.

## Rule 5 — No unnecessary spending

All initial tooling must fit a £0 budget.

Document any future infrastructure expenses before recommending them.

## Rule 6 — No destructive changes without approval

Do not delete existing repositories, modify live Discord resources, deploy to production, charge customers, or alter infrastructure without explicit approval.

## Rule 7 — Security by design

Protect credentials, enforce authorisation, maintain audit logs, and validate all external input.

## Rule 8 — Maintainability

Use modular code, clear contracts, documented decisions, and automated tests.

## Rule 9 — Honest reporting

Distinguish implemented, tested, simulated, blocked, and planned functionality.

## Rule 10 — Product quality

Avoid generic AI-generated interfaces, unnecessary complexity, and decorative features without purpose.

---

# 4. CODEX ENGINEERING ORGANISATION

Create an engineering team structure with specialised roles.

## 4.1 Technical Lead / Orchestrator

Owns:

- Architecture.
- Roadmap.
- Task decomposition.
- Dependency planning.
- Agent delegation.
- Code integration.
- Final review.
- Milestone tracking.

The technical lead must prevent multiple agents from editing conflicting files simultaneously.

## 4.2 Product Architect

Owns:

- User stories.
- Customer workflows.
- Feature specifications.
- Acceptance criteria.
- Product prioritisation.
- Usability requirements.
- Commercial relevance.

## 4.3 Platform Engineer

Owns:

- Fastify backend.
- Database.
- API contracts.
- Business logic.
- Integrations.
- Webhooks.
- Background jobs.
- Operational events.

## 4.4 Desktop Engineer

Owns:

- Tauri 2.
- Rust.
- Windows integration.
- SSH.
- Terminal functionality.
- Window management.
- Local configuration.
- Desktop-to-backend communication.

## 4.5 Discord Engineer

Owns:

- discord.js.
- Bot architecture.
- Discord events.
- Slash commands.
- Server blueprints.
- Role permissions.
- Ticket workflows.
- Bot deployment.
- Support integrations.

## 4.6 Commerce and Marketplace Engineer

Owns:

- Payment integrations.
- Orders.
- Refunds.
- Disputes.
- Product catalogues.
- Licences.
- Supplier adapters.
- Commissions.
- Fulfilment.

## 4.7 Creative Director / UI Engineer

Owns:

- KUSH brand identity.
- Design system.
- Typography.
- Colour.
- CSS.
- Motion.
- Startup animations.
- Original graphics.
- 3D elements.
- Visual consistency.
- Accessibility.

## 4.8 Security Engineer

Owns:

- Threat modelling.
- Authentication.
- Authorisation.
- Credential security.
- API protection.
- Secure SSH.
- Payment security.
- Dependency review.
- Audit requirements.

## 4.9 QA / Release Engineer

Owns:

- Unit tests.
- Integration tests.
- End-to-end tests.
- Native testing.
- Accessibility testing.
- Screenshot review.
- Regression testing.
- Release readiness.

## Agent operating model

Create:

- AGENTS.md.
- agents/technical-lead.md.
- agents/product-architect.md.
- agents/platform-engineer.md.
- agents/desktop-engineer.md.
- agents/discord-engineer.md.
- agents/commerce-engineer.md.
- agents/creative-director.md.
- agents/security-engineer.md.
- agents/qa-engineer.md.

Each role must define:

- Responsibilities.
- File ownership.
- Deliverables.
- Quality gates.
- Handoff requirements.
- Escalation conditions.

Use actual Codex subagents when supported.

Otherwise, execute these responsibilities sequentially.

Do not simulate independent reviews or claim agents performed work they did not perform.

---

# 5. TECHNOLOGY STACK

Use supported, compatible versions.

Verify current package documentation and compatibility before implementation.

## Monorepo

- pnpm workspaces.
- Turborepo.
- TypeScript strict mode.
- ESLint.
- Prettier.

## Desktop

- Tauri 2.
- Rust.
- React.
- Vite.
- TypeScript.
- TanStack Query.
- Zustand where appropriate.
- xterm.js.

## Backend

- Node.js LTS.
- Fastify.
- PostgreSQL.
- Drizzle ORM.
- Zod.
- Pino.
- OpenAPI.

## Background processing

Start with a simple persistent job model.

Introduce Redis and BullMQ only when justified.

## Discord

- discord.js.
- Discord REST API.
- Discord Gateway.
- Slash commands.
- Persistent ticket storage.

## Website

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.

## Design

- Tailwind CSS.
- CSS variables.
- Radix UI primitives.
- Motion.
- Rive where suitable.
- Three.js / React Three Fiber when justified.
- Custom CSS and SVG artwork.

## Commerce

- Stripe test mode initially.
- Verified payment webhooks.
- Authorised supplier APIs.

## Storage

- Local development storage initially.
- S3-compatible object storage later when required.

## Testing

- Vitest.
- Playwright.
- Rust tests.
- API integration tests.
- Accessibility testing.
- Visual regression testing.

## Infrastructure

- Docker Compose.
- Local PostgreSQL.
- Local API and workers.
- Environment-specific configuration.

Do not require paid cloud services for development.

---

# 6. REPOSITORY STRUCTURE

Create a monorepo resembling:

kush/
  AGENTS.md
  package.json
  pnpm-workspace.yaml
  turbo.json

  apps/
    developer/
    website/
    portal/
    discord-bot/

  services/
    api/
    worker/

  packages/
    database/
    contracts/
    auth/
    integrations/
    ui/
    config/
    observability/

  agents/
    technical-lead.md
    product-architect.md
    platform-engineer.md
    desktop-engineer.md
    discord-engineer.md
    commerce-engineer.md
    creative-director.md
    security-engineer.md
    qa-engineer.md

  docs/
    architecture/
    brand/
    business/
    products/
    discord/
    security/
    decisions/
    roadmap/

  infra/
    docker/
    deployment/

  tests/
    integration/
    e2e/
    visual/

Create only the directories needed for the current milestone.

Do not populate future applications with fake pages simply to make the repository appear complete.

---

# 7. PLATFORM ARCHITECTURE

KUSH Developer is a desktop client of the KUSH Platform API.

The backend is authoritative for business operations.

The desktop client must never be trusted to enforce permissions.

Use a modular monolith with clearly separated domains:

- Identity.
- Customers.
- Projects.
- Support.
- Discord.
- Infrastructure.
- Commerce.
- Products.
- Licences.
- Suppliers.
- Marketplace.
- Integrations.
- API management.
- Audit and events.

Each domain must have:

- Data models.
- Service interfaces.
- Validation.
- Authorisation.
- API contracts.
- Error handling.
- Tests.
- Documentation.

Use stable identifiers, timestamps, migration history, and explicit state transitions.

Avoid unnecessary distributed architecture.

---

# 8. KUSH DEVELOPER — FUNCTIONAL MODULES

## 8.1 Application Foundation

Implement:

- Native desktop application.
- Functional navigation.
- Local development authentication.
- Secure sessions.
- Role-based access control.
- PostgreSQL persistence.
- Database migrations.
- Desktop-to-backend communication.
- API health reporting.
- Configuration management.
- Audit logs.
- Activity history.
- Connection profiles.
- Error reporting.
- Integration health states.

No fake statistics.

## 8.2 Client and Project Management

Implement:

- Customer profiles.
- Organisations.
- Contact information.
- Project records.
- Project stages.
- Scope descriptions.
- Requirements.
- Deliverables.
- Milestones.
- Tasks.
- Due dates.
- Project notes.
- Files and attachments.
- Client communication records.
- Project activity history.
- Handover checklists.

Support the service-first business model.

## 8.3 Proposals and Service Delivery

Implement:

- Service catalogue.
- Proposal drafts.
- Scope templates.
- Price estimates.
- Revision limits.
- Deliverable lists.
- Acceptance criteria.
- Proposal status.
- Client approval records.
- Project handover records.
- Maintenance agreements.
- Support obligations.

Do not implement legally binding electronic signatures without evaluating the applicable requirements.

## 8.4 Infrastructure Management

Implement:

- SSH connection profiles.
- Secure SSH authentication.
- SSH host-key verification.
- Interactive terminal.
- Remote system information.
- Service inspection.
- Service logs.
- Deployment targets.
- Deployment history.
- Authorised command execution.
- Service restart actions.
- Connection status.
- Failure reporting.
- Administrative audit events.

Use xterm.js for terminal rendering.

Never silently disable host-key verification.

Require confirmation for destructive operations.

## 8.5 Discord Management

Implement:

- Bot configuration.
- Secure bot credential storage.
- Guild inspection.
- Role hierarchy inspection.
- Channel inspection.
- Permission overwrite inspection.
- Slash-command management.
- Bot event processing.
- Bot logs.
- Bot health.
- Ticket events.
- Support notifications.
- Discord audit events where available.

Respect Discord permission boundaries and rate limits.

## 8.6 Discord Support System

Implement:

- Ticket creation.
- Ticket categories.
- Staff assignment.
- Ticket priority.
- Ticket status.
- Customer replies.
- Staff replies.
- Internal notes.
- Private ticket access.
- Ticket closure.
- Ticket reopening.
- Transcript export.
- Activity notifications.
- Retention settings.

Persist ticket state in PostgreSQL.

## 8.7 Payments

Implement Stripe test-mode integration.

Features:

- Test transactions.
- Verified webhooks.
- Payment status.
- Refund records.
- Dispute records.
- Payment reconciliation.
- Authorised test refunds.
- Transaction history.
- Audit logs.

Never store raw card data.

## 8.8 Products and Licensing

Implement:

- Product records.
- Product versions.
- Release records.
- Download entitlements.
- Licence issuance.
- Licence activation.
- Licence revocation.
- Licence verification.
- Customer ownership.
- Product access policies.
- Audit logs.

Enforce entitlements on the backend.

## 8.9 Supplier and Reseller APIs

Implement:

- Supplier profiles.
- Secure credentials.
- Adapter interfaces.
- Product catalogue imports.
- Availability synchronisation.
- Supplier pricing.
- Reseller pricing.
- Commission rules.
- Supplier orders.
- Fulfilment callbacks.
- Webhooks.
- Failure retries.
- Operational logs.

Use local mock suppliers until authorised real credentials exist.

## 8.10 API Studio

Implement:

- Internal API registry.
- Endpoint definitions.
- HTTP methods.
- Request schemas.
- Response schemas.
- API key issuance.
- Credential revocation.
- Permission scopes.
- Rate limits.
- Webhook definitions.
- Request logs.
- API usage records.
- Endpoint testing.
- OpenAPI documentation.

Do not expose arbitrary code execution through user-configurable API definitions.

## 8.11 Operational Overview

Build a useful operational home screen.

Show only genuine information such as:

- Open tickets.
- Active projects.
- Outstanding tasks.
- Failed integrations.
- Recent deployments.
- Pending support actions.
- Recent payment events.
- Service health.
- Important errors.

If no data exists, display a helpful empty state.

Do not invent activity.

---

# 9. NEW KUSH DISCORD ECOSYSTEM

The existing Discord server and bots are being replaced.

Design a completely new KUSH Discord environment.

Do not delete the old server automatically.

Do not create live Discord resources without explicit approval.

## Discord purpose

The server is the central community and business hub for:

- KUSH software products.
- Custom development services.
- Support.
- Customers.
- Product announcements.
- Software releases.
- Creator partnerships.
- GFX/VFX services.
- Resellers.
- Referrals.
- Staff operations.
- Community discussions.

It must not be designed only around the desktop applications.

## Proposed role hierarchy

Design and validate roles such as:

- Owner.
- Administrator.
- Developer.
- Support Lead.
- Support Staff.
- Creative Partner.
- Verified Reseller.
- Verified Customer.
- Beta Tester.
- Community Member.
- Muted / Restricted.
- Bots.

Determine precise permissions for every role.

Avoid unnecessary Administrator permissions.

Do not grant bots more permissions than necessary.

## Proposed channel architecture

### START HERE

- welcome
- rules
- verification
- announcements
- getting-started

### KUSH

- about-kush
- services
- products
- roadmap
- changelog

### COMMUNITY

- general
- development
- showcases
- feedback
- suggestions
- media

### SUPPORT

- support-information
- open-ticket
- known-issues
- service-status

### PRODUCTS

- releases
- downloads-information
- beta-programme
- product-feedback

### PARTNERS

- partner-information
- reseller-information
- creator-information
- applications

### STAFF

- staff-chat
- ticket-queue
- staff-announcements
- operations
- bot-logs
- audit-events

### ADMINISTRATION

- owner-operations
- infrastructure-alerts
- payment-alerts
- security-events
- integration-management

This is an initial blueprint, not an instruction to create unnecessary empty channels.

Review the information architecture before finalising it.

## Permissions

For every channel, explicitly define:

- Who can view it.
- Who can read message history.
- Who can send messages.
- Who can attach files.
- Who can embed links.
- Who can create threads.
- Who can mention everyone.
- Who can manage messages.
- Who can manage the channel.

Read-only channels must actually prevent ordinary users from posting.

Private channels must be inaccessible to unauthorised roles.

Ticket channels must isolate customer information.

Create automated permission tests and a previewable permission matrix.

## Bot architecture

Prefer a small number of well-designed bots over many redundant bots.

Build modular bot functionality for:

- Support tickets.
- Role assignment.
- Customer verification.
- Announcements.
- Product notifications.
- Staff alerts.
- Audit logging.
- Integration health.
- Referral tracking where authorised.
- Server configuration synchronisation.

Use slash commands where appropriate.

Document privileged intents and developer-portal requirements.

Provide a declarative server blueprint with dry-run previews and idempotent application.

---

# 10. COMMERCE AND CLIENT OWNERSHIP

KUSH must operate transparently.

Client ownership requirements:

- Customers retain ownership of their own accounts.
- Customers retain ownership of their domains.
- Customers retain ownership of their repositories unless otherwise agreed.
- Customers control their payment-provider accounts.
- Access granted to KUSH must be limited and revocable.
- Infrastructure costs must be disclosed.
- Handover documentation must be provided.
- Data exports must be supported where appropriate.

Recurring maintenance must provide clearly defined ongoing value.

Do not create artificial customer lock-in.

Do not promise guaranteed business results.

---

# 11. BRAND IDENTITY

KUSH is inspired by cannabis culture, particularly Kush, Purple Haze, and Mary Jane.

The identity should feel:

- Distinctive.
- Creative.
- Premium.
- Technically sophisticated.
- Smooth.
- Organic.
- Artistic.
- Confident.
- Modern.

Use the supplied KUSH logo as the primary visual reference.

Do not substitute a generic geometric software-company logo.

## Palette

Suggested foundation:

- Obsidian black.
- Charcoal.
- Deep haze purple.
- Lavender.
- Botanical green.
- Acid green accents.
- Soft neutral white.
- Muted grey.

Create design tokens.

Avoid overusing bright accents.

## Visual language

Use:

- Smoked glass.
- Restrained glassmorphism.
- Fluid surfaces.
- Organic shapes.
- Subtle depth.
- Selective reflections.
- Layered backgrounds.
- Custom typography.
- Original illustrations.
- Motion graphics.
- Selective 3D.
- Carefully designed transitions.

Avoid:

- Generic SaaS cards.
- Excessive rounded rectangles.
- Neon everywhere.
- Random glowing borders.
- Decorative charts without purpose.
- Repetitive dashboard layouts.
- Inconsistent spacing.
- Low-contrast text.
- Unnecessary animation.

---

# 12. FRAMELESS DESKTOP APPLICATION

The desktop application must not use the default Windows title bar.

Implement a frameless Tauri window.

Requirements:

- No native title bar.
- No unnecessary visible window borders.
- Custom minimise control.
- Custom maximise and restore control.
- Custom close control.
- Functional dragging.
- Functional resizing.
- Proper maximised bounds.
- Multi-monitor support.
- High-DPI support.
- Correct focus behaviour.
- Windows snapping where supported.
- Keyboard accessibility.
- No overlapping window controls.

Use restrained, integrated controls rather than a separate generic header strip.

Do not compromise essential window functionality.

---

# 13. CUSTOM SCROLLING

Avoid generic browser-style scrollbars.

Implement:

- Consistent custom scrollbars or overlay indicators.
- Smooth mouse-wheel behaviour.
- Trackpad support.
- Keyboard scrolling.
- Touch scrolling where applicable.
- Nested scroll regions.
- No accidental horizontal overflow.
- Accessible scroll affordances.

Do not globally disable scrolling.

Respect operating-system accessibility preferences.

---

# 14. KUSH STARTUP EXPERIENCE

After functional milestones are verified, build a cinematic startup experience.

Creative direction:

- Purple haze.
- Organic green fluid.
- Abstract smoke-like motion.
- Liquid transitions.
- Custom KUSH symbol reveal.
- Layered lighting.
- Smooth easing.
- Subtle depth.
- Transition into the application.

Requirements:

- Fast startup.
- Optional skip.
- Reduced-motion alternative.
- No unnecessary blocking.
- No excessive GPU use.
- No flashing effects.
- Optional sound disabled by default.
- Graceful handling of startup errors.

Use original assets and free tools.

Do not require paid animation services.

---

# 15. VISUAL COMPONENT SYSTEM

Design original components for:

- Navigation.
- Sidebars.
- Command palettes.
- Tables.
- Search.
- Filters.
- Forms.
- Dialogs.
- Notifications.
- Logs.
- Terminals.
- Code editors.
- Project workspaces.
- Ticket interfaces.
- Customer profiles.
- Integration configuration.
- Settings.
- Status indicators.
- Empty states.
- Loading states.
- Error states.

Every component must serve a functional purpose.

Prioritise clarity and information density where appropriate.

---

# 16. ACCESSIBILITY

Implement:

- Keyboard navigation.
- Visible focus states.
- Screen-reader labels.
- Semantic controls.
- Sufficient contrast.
- Scalable text.
- Accessible dialogs.
- Predictable navigation.
- Reduced-motion support.
- Clear error messages.
- Accessible scrolling.
- Usable interaction targets.

Minimalism must not mean removing essential controls.

---

# 17. SECURITY

Implement appropriate controls for:

- Authentication.
- Authorisation.
- Role-based access.
- Session management.
- Secret storage.
- SSH credentials.
- Discord tokens.
- Payment webhooks.
- API keys.
- Supplier credentials.
- Input validation.
- Rate limiting.
- Audit logging.
- Sensitive operations.
- File uploads.
- Database backups.
- Recovery procedures.

Do not commit credentials.

Do not expose secrets to frontend bundles.

Use least privilege.

Require confirmation for destructive operations.

---

# 18. QUALITY ASSURANCE

Every completed feature must be tested.

Required categories:

- Unit tests.
- API integration tests.
- Database tests.
- Permission tests.
- End-to-end workflows.
- Native desktop tests.
- Accessibility tests.
- Regression tests.
- Visual checks.

For external services, distinguish:

- Mock verified.
- Sandbox verified.
- Live verified.
- Not verified.

Never claim live integration success based only on mocks.

Capture real screenshots when GUI tooling is available.

Inspect visual defects and fix them.

---

# 19. DEVELOPMENT ROADMAP

## M0 — Startup Foundation

- Repository.
- Engineering roles.
- Architecture.
- Documentation.
- Development tooling.
- Database.
- API contracts.
- Local environment.

## M1 — KUSH Developer Foundation

- Tauri desktop.
- Authentication.
- Navigation.
- Backend connectivity.
- Persistent configuration.
- Audit logging.

## M2 — Service Operations

- Clients.
- Projects.
- Proposals.
- Scope templates.
- Deliverables.
- Handover workflows.

## M3 — Discord Support Product

- Ticket bot.
- Ticket database.
- Staff workflow.
- Permissions.
- Transcripts.
- Local demonstration.

## M4 — New KUSH Discord

- New server blueprint.
- Roles.
- Channels.
- Permissions.
- Bots.
- Support workflows.
- Integration with KUSH Developer.

## M5 — Infrastructure

- SSH.
- Server connections.
- Service logs.
- Deployment management.
- Monitoring.

## M6 — Commerce

- Stripe test integration.
- Payment records.
- Refunds.
- Disputes.
- Entitlements.

## M7 — API Platform

- API Studio.
- Keys.
- Webhooks.
- Supplier adapters.
- Reseller integrations.

## M8 — Website

- Public brand website.
- Service catalogue.
- Portfolio.
- Contact workflow.
- Product information.

## M9 — Marketplace

- Products.
- Sellers.
- Partners.
- Orders.
- Downloads.
- Commissions.
- Fulfilment.

## M10 — Public Software Products

- PC diagnostics.
- Game benchmarking.
- Windows optimisation.
- Other validated products.

## M11 — Advanced Visual Overhaul

- Complete KUSH design system.
- Original logo assets.
- Frameless interface polish.
- Startup animation.
- Motion graphics.
- 3D elements.
- Visual regression testing.
- Accessibility validation.

Implement necessary functional UI and basic branding throughout earlier milestones.

Do not postpone all usability work until M11.

---

# 20. £0 BUDGET POLICY

Before adding any dependency or service, assess:

1. Is it free?
2. Is it open source?
3. Can it run locally?
4. Does it require a subscription?
5. Does it require a credit card?
6. Does it introduce usage charges?
7. Can it be replaced by an existing tool?
8. Is it necessary for the current milestone?

Use free local development infrastructure wherever possible.

Do not purchase a VPS before there is a deployment requirement.

Do not require a paid domain before a public launch.

Do not use paid design assets.

Do not require paid AI APIs.

Do not introduce recurring expenses without approval.

If a production service requires hosting, document the cost and operational trade-offs.

Do not claim that local development provides production uptime.

---

# 21. PROJECT DOCUMENTATION

Maintain:

- AGENTS.md.
- docs/architecture/OVERVIEW.md.
- docs/architecture/API.md.
- docs/architecture/DATABASE.md.
- docs/brand/IDENTITY.md.
- docs/brand/DESIGN-SYSTEM.md.
- docs/business/SERVICES.md.
- docs/business/CUSTOMER-VALIDATION.md.
- docs/products/KUSH-DEVELOPER.md.
- docs/discord/SERVER-BLUEPRINT.md.
- docs/discord/PERMISSIONS.md.
- docs/security/THREAT-MODEL.md.
- docs/roadmap/STATUS.md.
- docs/decisions/.

Record:

- Completed work.
- Current work.
- Blockers.
- Known defects.
- Architecture decisions.
- Test results.
- Next milestone.

Documentation must reflect the actual implementation.

---

# 22. CODEX EXECUTION RULES

Do not attempt to complete every milestone in one execution.

Work incrementally.

At the beginning of each task:

1. Read AGENTS.md.
2. Read the roadmap and current status.
3. Inspect relevant code.
4. Identify dependencies.
5. Define acceptance criteria.
6. Assign engineering responsibilities.
7. Implement the smallest complete vertical slice.
8. Test the implementation.
9. Review security.
10. Review usability.
11. Update documentation.
12. Report results.

Use isolated branches or worktrees for independent parallel tasks when supported.

Avoid conflicting edits.

Do not claim delegation occurred if it did not.

Do not claim tests passed unless executed.

Do not silently skip failures.

Do not commit generated secrets.

Do not modify live external systems without approval.

Preserve project continuity across Codex sessions.

---

# 23. FIRST EXECUTION — BEGIN NOW

Start with M0 and the first functional slice of M1.

Perform these tasks:

1. Inspect the operating system and installed development tools.
2. Inspect the current directory.
3. Determine whether this is a clean repository.
4. Do not delete or overwrite unrelated files.
5. Create the monorepo.
6. Configure pnpm and Turborepo.
7. Establish AGENTS.md.
8. Create specialised engineering role instructions.
9. Write the initial architecture documentation.
10. Create the PostgreSQL development configuration.
11. Create the Fastify API.
12. Create the initial database schema.
13. Create the Tauri 2 desktop application.
14. Establish desktop-to-backend communication.
15. Implement initial authentication and authorisation.
16. Implement an API health endpoint.
17. Implement a real connection-status interface.
18. Add logging and error handling.
19. Add initial automated tests.
20. Run type checks.
21. Run backend tests.
22. Run desktop build checks.
23. Launch the actual application where possible.
24. Verify real communication between the desktop and backend.
25. Record screenshots if supported.
26. Update the project status documentation.
27. Report the exact results.

Use basic functional styling only.

Do not begin the advanced visual overhaul yet.

Do not fabricate completed integrations.

---

# 24. MILESTONE COMPLETION FORMAT

After each milestone, report:

## Implemented
Exactly what was built.

## Verified
Tests and workflows actually executed.

## Incomplete
Unfinished functionality.

## Blocked
External requirements or missing credentials.

## Security
Known issues and mitigations.

## Budget
Any potential expenses.

## Next
The next implementation milestone.

A milestone must not be marked complete merely because code exists.

---

# FINAL INSTRUCTION

KUSH must become a genuine, operational software business.

Build the internal systems necessary to deliver real services.

Prioritise earning the first satisfied customer before expanding into unnecessary product complexity.

Keep the original ambition of a connected software ecosystem.

Maintain the distinctive KUSH creative identity.

Develop working functionality first.

Then transform the software into an exceptional, visually distinctive experience with original graphics, fluid motion, refined glassmorphism, cinematic startup animations, and carefully engineered frameless desktop interfaces.

Never sacrifice reliability, security, accessibility, or usability for appearance.

**Begin implementing M0 and the first functional vertical slice of M1 now. Do not stop at planning documents.**