# KUSH engineering

Read the supplied founding directive (docs/FOUNDING-DIRECTIVE.md), docs/roadmap/STATUS.md and relevant domain code before changes. This is a fresh identity; no Veyrix code or assets may be reused without an explicit audit and owner approval.

Work one verified vertical slice at a time. Keep functionality, security, accessibility and customer usefulness ahead of visual effects. Never invent business data or integration verification. Disabled or unavailable features must explain their status.

Use the roles under agents/. The technical lead assigns disjoint file ownership for actual subagents, integrates changes and records real verification. Role files alone do not constitute agents.

Stack: pnpm workspaces, Turborepo, strict TypeScript, Fastify, PostgreSQL/Drizzle and Tauri 2/React. Local development only. Never add paid services or card requirements without owner approval. Read current official documentation for affected dependencies.

No live Discord changes, deployment, customer charges or destructive operations without explicit owner approval. Bind development services to loopback. Never commit credentials, persist bearer tokens in browser storage, log passwords, or trust frontend roles. Database migrations and bootstrap must be explicit; no default administrator credentials.

Run pnpm typecheck, pnpm test, pnpm lint and relevant builds. Report failures and skipped integrations accurately. Native launch, screenshots and live integration checks require actual evidence. Update STATUS.md after milestones. Do not overwrite unrelated files or publish this repository without instruction.

Inherited Astro instructions apply if Astro is introduced: consult official Astro guides and use astro dev --background. KUSH currently uses Vite, not Astro.
