# ADR 0001: Begin with a local modular monolith

Status: accepted for initial implementation, 2026-10-16.

Context: £0 starting budget, no validated paid customers, broad long-term ecosystem. Completing the entire platform first would defer learning and increase operating complexity.

Decision: implement M0 and one M1 vertical slice in a pnpm/Turborepo workspace: Tauri/React desktop, Fastify API, shared contracts, PostgreSQL/Drizzle persistence, authentication, health and audit. The API is authoritative. Use loopback development infrastructure. Create directories only when they contain current work.

Consequences: native toolchain and local PostgreSQL are explicit prerequisites. Mocks do not establish database or desktop integration. Workers are introduced only with real persistent work; Redis, cloud hosting, website, portal, bot and marketplace are deferred. No Veyrix reuse or unapproved spending. The logo reference is missing and blocks faithful logo derivation, not basic functionality.

Revisit after M1 verification and customer discovery. New services or framework upgrades require a recorded reason, compatibility check and current milestone need.
