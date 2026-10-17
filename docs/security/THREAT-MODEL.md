# Local platform threat model

Scope: implemented local M1 identity and narrow M2 delivery. This is a design/control review, not a penetration test or production certification.

Assets: credentials/sessions, staff roles, audit integrity, client contact information, proposal/approval evidence and handover documents. Boundaries: webview → loopback API → PostgreSQL; native capabilities → OS; exports → filesystem. Other local processes remain a threat: loopback is not an authentication boundary.

| Threat                              | Implemented control / remaining limitation                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guessing/enumeration                | Password hashes, generic credential error, dummy verification, per-process and PostgreSQL-backed hashed-IP login throttling                                     |
| Session theft                       | Random opaque tokens, hashed database storage, eight-hour expiry, memory-only client custody; logout and password/access changes revoke sessions                |
| Privilege escalation                | Server reads enabled account/current role; admin identity/profile management; viewer delivery writes denied; last-admin protections                             |
| Owner lockout                       | Offline direct-database recovery requires explicit confirmation, resets to enabled admin and revokes sessions; direct DB owner access remains highly privileged |
| Sensitive logs                      | Authorization/password/currentPassword redaction, safe errors, no-store protected responses; audit contains actor/action/time, no raw secrets                   |
| Stale/unauthorised business changes | Strict Zod schemas, bounded bodies/lists, version conflicts, row locks, transactional mutation audit and immutable approved definitions                         |
| Fabricated delivery readiness       | Server requires evidence/check completion and handover fields; operator-entered evidence is still unverified human input                                        |
| Local endpoint abuse                | Loopback binding, restricted origins, authentication and allowlisted local connection endpoints; CORS is not access control                                     |
| Audit gaps                          | Failed/throttled login, identity denials and delivery denials are recorded; business mutations append transactional audit events                                |
| Data loss/export exposure           | Versioned migrations and JSON exports; exports contain client data and need controlled handling; exports are not full database backups                          |
| Native bridge abuse                 | Minimal Tauri window capabilities; no arbitrary command bridge; physical window/accessibility matrix still incomplete                                           |

Cleanup runs on readiness and every minute for expired sessions and login-attempt rows older than one day. Plain loopback HTTP is a local development choice; remote deployment needs TLS, deployment hardening and a fresh review. No customer tenant isolation is provided: authenticated internal users can read delivery records.

Coordinator evidence: 13 passing desktop/API tests using real disposable PostgreSQL, offline recovery explicit-confirmation deny/success, full native test delivery/export, native window-state queries and signed-in axe zero violations. This is bounded evidence, not exhaustive race/security coverage or manual accessibility validation.

Before real customer use, verify backup/restore, retention/export handling, owner recovery custody and operating obligations. The coordinator maintains runtime backup instructions separately. Before later integrations review SSH host keys/credential custody, Discord ticket isolation, payment webhook signatures/replays, supplier idempotency and upload controls. No such live integrations are implemented or verified.

References: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [Tauri security](https://v2.tauri.app/security/), [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html).
