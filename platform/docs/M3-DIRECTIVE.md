# KUSH — M3 MASTER DEVELOPMENT DIRECTIVE
## Discord Support Platform, Bot Infrastructure & KUSH Developer Integration

You are continuing development of the existing KUSH monorepo.

Do not start a new repository, rebuild existing working functionality, or replace the established architecture.

Your mission is to implement a production-oriented, reusable Discord support and automation platform that integrates directly with KUSH Developer.

This system must serve two purposes:

1. Operate KUSH's own Discord community and business support infrastructure.
2. Become a reusable service that KUSH can configure, deploy and maintain for future paying customers.

**Budget: £0.**

Use existing local development infrastructure and free, open-source technologies.

No paid hosting, paid APIs, external subscriptions or live deployments without explicit approval.

---

# 1. READ AND VERIFY THE EXISTING PROJECT

Before implementing anything:

- Read AGENTS.md.
- Read the latest roadmap and status documents.
- Inspect the existing Fastify API.
- Inspect the PostgreSQL schema and migrations.
- Inspect the existing authentication and authorisation implementation.
- Inspect the existing Tauri desktop application.
- Inspect the existing customer and project management workflows.
- Inspect the existing Discord blueprint and permission matrix.
- Run the existing tests.
- Identify current limitations and integration boundaries.

Preserve existing functionality.

Do not duplicate existing authentication, database, logging or API systems.

Do not invent architectural decisions without inspecting the repository.

---

# 2. CODEX TEAM STRUCTURE

Use the established engineering roles.

Assign responsibilities as follows:

## Technical Lead

- Plan implementation.
- Define dependencies.
- Delegate non-overlapping tasks.
- Review architecture.
- Integrate completed work.
- Track acceptance criteria.

## Discord Engineer

- Bot architecture.
- Gateway event handling.
- Slash commands.
- Ticket channel management.
- Discord permissions.
- Rate limits.
- Bot lifecycle.

## Platform Engineer

- Database schema.
- Ticket APIs.
- Event processing.
- Integration contracts.
- Persistent state.
- Audit logs.

## Desktop Engineer

- KUSH Developer Discord workspace.
- Ticket management interface.
- Bot status.
- Server configuration.
- Real-time updates.

## Security Engineer

- Token protection.
- Server-side authorisation.
- Tenant isolation.
- Permission verification.
- Abuse prevention.
- Audit review.

## QA Engineer

- Automated tests.
- Integration tests.
- End-to-end workflows.
- Permission tests.
- Regression tests.
- Native desktop verification.

Use actual Codex subagents where supported.

Avoid simultaneous conflicting edits.

---

# 3. CORE ARCHITECTURE

Create a reusable Discord integration architecture.

Use:

- discord.js.
- Existing Fastify API.
- Existing PostgreSQL database.
- Existing Drizzle ORM.
- Existing authentication system.
- Existing audit logging.
- Existing shared Zod contracts.
- Existing Tauri desktop application.

The Discord bot must operate as a separate long-running process.

The bot must not depend on KUSH Developer being open.

Use the backend as the authoritative source for ticket and customer records.

Design for future multi-tenant operation.

Every relevant record must be associated with an organisation or tenant.

Enforce tenant boundaries on the backend.

Do not allow one customer's server, tickets, messages, credentials or configuration to become accessible to another customer.

Initially, support one authorised Discord guild per tenant, while keeping the architecture extensible.

Do not introduce microservices or Redis unless justified.

---

# 4. DISCORD BOT FOUNDATION

Implement a real Discord bot application.

Required functionality:

- Secure token configuration.
- Bot startup and shutdown.
- Gateway connection handling.
- Reconnect behaviour.
- Guild availability detection.
- Discord API error handling.
- Rate-limit-aware requests.
- Slash-command registration.
- Command permission checks.
- Structured logs.
- Bot health reporting.
- Persistent configuration.
- Audit events.
- Graceful shutdown.

Use least-privilege Discord permissions.

Do not request privileged gateway intents unless genuinely necessary.

Do not expose bot credentials to the desktop frontend.

Do not log tokens or sensitive message contents unnecessarily.

Support local development using environment-based configuration.

Do not create live Discord applications or invite bots without owner approval.

---

# 5. TICKET SYSTEM

Build a complete support ticket lifecycle.

## Ticket creation

Support:

- Slash command to open a ticket.
- Configurable ticket categories.
- Optional ticket description.
- Customer identity.
- Unique ticket identifier.
- Initial ticket status.
- Private Discord ticket channel or thread.
- Customer access.
- Assigned support roles.
- Initial support instructions.

Validate permissions before creating resources.

Prevent duplicate ticket creation from repeated Discord interactions.

## Ticket management

Support:

- Open.
- Pending.
- In progress.
- Waiting for customer.
- Resolved.
- Closed.
- Reopened.

Implement explicit state transitions.

Support:

- Staff assignment.
- Priority.
- Category changes.
- Internal notes.
- Customer messages.
- Staff replies.
- Ticket history.
- Activity timestamps.
- Audit events.

## Ticket closure

Support:

- Close confirmation.
- Closure reason.
- Transcript generation.
- Transcript export.
- Retention policy.
- Reopening where permitted.
- Archival or deletion only according to configured policy.

Do not delete ticket data automatically without a defined retention policy.

---

# 6. PRIVATE TICKET SECURITY

Implement strict access boundaries.

Requirements:

- Customers can access only their own tickets.
- Assigned staff can access authorised tickets.
- Other customers cannot view ticket channels.
- Internal notes must never be posted into customer-visible channels.
- Permission overwrites must be validated.
- Discord role hierarchy must be respected.
- Ticket APIs must enforce backend authorisation.
- Guild identifiers must be validated against tenant ownership.
- Cross-tenant access must be rejected.

Create automated tests for these boundaries.

Treat Discord channel visibility and backend API access as separate security layers.

Do not assume a private Discord channel automatically makes backend data private.

---

# 7. DISCORD MESSAGE SYNCHRONISATION

Implement reliable event processing.

Support:

- Incoming customer messages.
- Staff messages.
- Ticket activity events.
- Message timestamps.
- Discord message identifiers.
- Edited messages where supported.
- Deleted message handling where supported.
- Duplicate event prevention.
- Reconnection reconciliation where practical.

Avoid storing unnecessary personal data.

Document when message content access requires privileged intents.

If message content is unavailable, use supported interaction-based workflows instead of silently failing.

Use stable event identifiers and idempotent processing.

Do not invent message history when Discord access is unavailable.

---

# 8. TRANSCRIPT SYSTEM

Implement real transcript generation.

Support:

- Ticket metadata.
- Customer identity reference.
- Staff participants.
- Message chronology.
- Timestamps.
- Ticket state changes.
- Closure reason.
- Export timestamp.

Support JSON export initially.

Add safe HTML export only if it can be implemented securely.

Escape untrusted content.

Do not embed active scripts in transcript exports.

Provide configurable retention and deletion controls.

Do not expose transcripts through public URLs.

---

# 9. KUSH DEVELOPER DISCORD WORKSPACE

Extend the existing Tauri application.

Create a functional Discord management area.

## Overview

Show real information:

- Connected bot status.
- Configured guilds.
- Open tickets.
- Pending tickets.
- Assigned tickets.
- Recent ticket activity.
- Integration errors.

Use proper empty states when nothing is connected.

## Ticket management

Implement:

- Ticket list.
- Search.
- Filters.
- Ticket details.
- Message history.
- Staff assignment.
- Priority changes.
- Status changes.
- Internal notes.
- Staff replies.
- Transcript export.
- Error handling.

All actions must call real backend endpoints.

## Bot management

Implement:

- Bot connection status.
- Guild connection status.
- Last successful heartbeat.
- Integration configuration.
- Recent errors.
- Command registration status.
- Health information.

Do not fabricate online status.

## Server configuration

Implement:

- Role inspection.
- Channel inspection.
- Permission matrix.
- Server blueprint preview.
- Configuration differences.
- Safe application planning.

Do not provide destructive one-click actions without review and confirmation.

---

# 10. NEW KUSH DISCORD SERVER BLUEPRINT

The existing Discord server will not be reused.

Create a blueprint for a new KUSH server.

Do not create the live server automatically.

## Server purpose

The server must support:

- KUSH Studio client services.
- KUSH Developer.
- KUSH Products.
- KUSH Marketplace.
- Support.
- Creators.
- Resellers.
- Partners.
- Staff.
- Community.

## Channel structure

Design an organised structure with categories for:

### START HERE
- Welcome.
- Rules.
- Verification.
- Announcements.
- Getting started.

### KUSH STUDIO
- Services.
- Portfolio.
- Commission enquiries.
- Development updates.

### KUSH PRODUCTS
- Product information.
- Releases.
- Changelog.
- Downloads information.
- Product support.
- Beta testing.

### COMMUNITY
- General discussion.
- Development.
- Showcases.
- Feedback.
- Suggestions.
- Media.

### SUPPORT
- Support information.
- Open a ticket.
- Known issues.
- Service status.

### PARTNERS
- Partner information.
- Reseller information.
- Creator information.
- Partner applications.

### STAFF
- Staff discussion.
- Ticket queue.
- Staff announcements.
- Operations.
- Bot logs.

### ADMINISTRATION
- Owner operations.
- Infrastructure alerts.
- Payment alerts.
- Security events.
- Integration management.

Optimise the structure for usability.

Do not create redundant or unnecessary channels.

---

# 11. ROLE HIERARCHY

Design an appropriate hierarchy.

Potential roles:

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
- Restricted.
- Bots.

Define exact permissions.

Do not grant Administrator permission unnecessarily.

Respect Discord's role hierarchy.

Ensure bot roles are placed correctly for authorised role management.

---

# 12. CHANNEL PERMISSIONS

Create a complete permission matrix.

For each channel define:

- View channel.
- Read message history.
- Send messages.
- Send messages in threads.
- Create threads.
- Attach files.
- Embed links.
- Add reactions.
- Mention everyone.
- Manage messages.
- Manage channel.
- Connect to voice.
- Speak in voice.

Apply only permissions relevant to the channel type.

Requirements:

- Announcements are read-only for ordinary members.
- Rules are read-only.
- Staff channels are private.
- Administration channels are restricted.
- Customer tickets are isolated.
- Support intake is accessible.
- Community channels support normal conversation.
- Partner areas have deliberate access rules.

Create automated permission tests.

Generate a readable permission matrix document.

---

# 13. DECLARATIVE SERVER BLUEPRINT ENGINE

Build a reusable server configuration engine.

Capabilities:

- Define desired roles.
- Define desired categories.
- Define desired channels.
- Define permission overwrites.
- Inspect current guild configuration.
- Calculate differences.
- Preview proposed changes.
- Detect unsupported operations.
- Apply approved changes.
- Record changes.
- Support safe reruns.

Use stable configuration identifiers.

Do not rely only on display names for matching resources.

Ensure operations are idempotent where possible.

Do not automatically delete unknown channels or roles.

Require explicit approval for destructive changes.

Respect Discord API rate limits.

---

# 14. CUSTOMER INSTALLATION MODEL

Design the Discord support system so KUSH can eventually deploy it for clients.

Requirements:

- Tenant-specific configuration.
- Guild-specific settings.
- Staff role mapping.
- Ticket category configuration.
- Ticket numbering.
- Transcript retention.
- Branding options.
- Bot connection health.
- Installation checklist.
- Configuration export.
- Handover documentation.

Initially, use a controlled installation process.

Do not build an unnecessary public self-service SaaS platform yet.

Client ownership must be preserved.

The customer should own their Discord server and relevant accounts.

KUSH should receive only the access necessary to perform agreed work.

---

# 15. CLIENT DELIVERY WORKFLOW

Connect the existing KUSH client/project system to Discord service delivery.

Support:

- Associate a Discord installation with a client.
- Associate it with a project.
- Record installation requirements.
- Record configuration scope.
- Record permission review.
- Record acceptance checks.
- Record handover completion.
- Record maintenance obligations.
- Export installation documentation.

Avoid duplicating existing project-management models.

Reuse existing client, project, task and handover functionality.

---

# 16. SECURITY REQUIREMENTS

Implement:

- Server-side tenant isolation.
- Staff authorisation.
- Discord permission validation.
- Secret redaction.
- Safe token handling.
- Audit logging.
- Input validation.
- Rate-limit awareness.
- Idempotent interaction handling.
- Safe transcript export.
- Configurable retention.
- Secure internal API communication.
- Failure recovery.

Do not allow arbitrary Discord API execution through the desktop interface.

Use controlled, validated operations.

---

# 17. TESTING REQUIREMENTS

Create automated tests covering:

- Ticket creation.
- Duplicate interaction handling.
- Ticket assignment.
- Status transitions.
- Ticket closure.
- Ticket reopening.
- Transcript generation.
- Customer isolation.
- Tenant isolation.
- Staff permissions.
- Internal note privacy.
- Guild ownership validation.
- Bot connection failure.
- API failure.
- Event duplication.
- Permission matrix evaluation.
- Blueprint difference generation.
- Safe repeated blueprint application.
- Client/project installation association.

Use mocked Discord API boundaries for local testing.

Clearly distinguish mocked tests from real Discord integration tests.

Do not claim real Discord verification without actual authorised access.

---

# 18. NATIVE DESKTOP VERIFICATION

Run:

- Type checks.
- Lint.
- Formatting checks.
- Unit tests.
- Integration tests.
- PostgreSQL tests.
- Desktop production build.
- Tauri native build.
- Native WebView2 smoke tests where available.
- Accessibility checks.
- Screenshot inspection.

Verify actual desktop-to-backend ticket workflows.

No fake data should be presented as real.

---

# 19. VISUAL REQUIREMENTS

Maintain the existing minimal functional styling during this milestone.

Do not begin the full cinematic KUSH design overhaul yet.

However:

- Preserve the frameless window.
- Preserve functional window controls.
- Avoid native-looking browser scrollbars where safely possible.
- Maintain accessible scrolling.
- Keep layouts readable.
- Avoid excessive borders.
- Avoid generic dashboard clutter.
- Provide proper loading, empty and error states.

The advanced KUSH logo, purple haze, organic green animation, glassmorphism, motion graphics and startup sequence belong to the later visual phase.

Do not compromise functionality to introduce visual effects prematurely.

---

# 20. £0 BUDGET REQUIREMENTS

Use only existing local resources.

Do not introduce:

- Paid hosting.
- Paid bot platforms.
- Paid APIs.
- Paid databases.
- Paid monitoring.
- Paid assets.
- Paid subscriptions.

Do not assume a VPS exists.

Do not claim that locally hosted bots have continuous production uptime.

Document future hosting requirements separately.

---

# 21. IMPLEMENTATION ORDER

Implement in this order:

1. Inspect existing architecture.
2. Define Discord integration contracts.
3. Create database migrations.
4. Implement ticket domain services.
5. Implement tenant and permission boundaries.
6. Implement ticket APIs.
7. Implement bot runtime.
8. Implement slash commands and interactions.
9. Implement message/event synchronisation.
10. Implement transcript exports.
11. Implement desktop ticket management.
12. Implement bot health and configuration.
13. Implement server blueprint and permission matrix.
14. Integrate with existing client/project workflows.
15. Add automated tests.
16. Run native verification.
17. Update documentation.
18. Report results.

Work in small, verifiable slices.

Do not create placeholder pages for unfinished functionality.

---

# 22. FIRST EXECUTION

Begin by reading the repository and establishing the Discord domain.

Implement the first complete vertical slice:

**Create ticket → persist ticket → retrieve ticket → update ticket → close ticket → export transcript.**

This must work through real backend endpoints and the existing PostgreSQL database.

Then integrate that workflow into the actual KUSH Developer desktop application.

After that, implement the Discord bot adapter and server blueprint in subsequent verified slices.

Do not attempt to complete everything in one untested coding pass.

Do not stop at planning documents.

---

# 23. COMPLETION REPORT

At the end of each slice, report:

## Implemented
What actually works.

## Verified
Which tests and workflows were executed.

## Incomplete
What remains unfinished.

## Blocked
Which credentials, permissions or external services are needed.

## Security
Any unresolved risks.

## Budget
Confirm actual spending and new cost dependencies.

## Next
The next specific development slice.

Never claim that the Discord bot is live if it has only been tested using mocks.

Never claim that the server has been created if only the blueprint exists.

---

# FINAL OBJECTIVE

Create a genuine, reusable Discord support and automation system that integrates with KUSH Developer.

It must support KUSH internally and be suitable for delivering scoped support automation services to future clients.

It must be secure, maintainable, permission-aware, extensible, and functional.

It must operate independently of the desktop application.

Preserve the £0 budget.

Preserve existing working functionality.

**Begin implementing the first real ticket-management vertical slice now.**