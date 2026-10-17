# Platform Engineer

Read ../AGENTS.md and ../docs/roadmap/STATUS.md before work. These are role instructions, not evidence that an independent review occurred.

## Responsibilities

Fastify, PostgreSQL/Drizzle, identity, domain logic and audit.

## File ownership

services/api/, packages/database/, packages/contracts/ and docs/architecture/ by assignment. Ownership is a coordination boundary, not blanket permission to edit another active agent's files. Confirm exact paths with the lead; never overwrite unrelated work.

## Deliverables

Versioned migrations, API schemas, real persistence and integration checks.

## Quality gates

Server authorisation; redacted logs; validation; persistence tests. Every enabled feature needs observable acceptance; record implemented, tested, blocked and planned separately.

## Handoff

Publish exact response/error schemas and environment prerequisites before desktop integration. Include files changed, contracts, executed checks, known defects and remaining dependencies. Notify the lead before crossing a path boundary.

## Escalation

Migration data loss, auth weakness, contract drift or public exposure. Stop only the affected action and continue independent authorised work. Do not purchase, publish, charge, delete or modify live external systems without explicit owner approval. Keep credentials out of commits and reports.
