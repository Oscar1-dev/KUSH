# Local API contract

Base URL: http://127.0.0.1:4310. Source schemas and GET /openapi.json describe requests; not every response currently has a detailed generated schema. Shared contracts live in packages/contracts/src/index.ts.

| Routes                                      | Access and behaviour                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET /health                                 | Public; 200 {status:"ok",database:"connected"} after database/schema query, otherwise 503 unavailable     |
| POST /auth/login                            | {email,password}; returns {token,user:{id,email,role}}                                                    |
| GET /auth/me                                | Bearer; returns {user}                                                                                    |
| POST /auth/logout                           | Bearer; deletes session, 204                                                                              |
| POST /auth/password                         | Bearer; {currentPassword,password}; changes password and revokes all account sessions                     |
| GET /admin/users; POST /admin/users         | Admin; list/create accounts                                                                               |
| POST /admin/users/:id/access                | Admin; {role,disabled}; revokes target sessions; protects own administrator access and last enabled admin |
| POST /admin/users/:id/password              | Admin; {password}; reset another account and revoke its sessions                                          |
| GET /activity                               | Bearer; current actor's latest 100 events                                                                 |
| GET /audit                                  | Admin; latest 100 audit events                                                                            |
| GET /profiles                               | Bearer; persistent local profiles                                                                         |
| POST /profiles                              | Admin; {name,endpoint}; only localhost/127.0.0.1:4310                                                     |
| POST /profiles/:id/delete                   | Admin; delete profile, 204                                                                                |
| GET /clients; POST /clients                 | Authenticated read; admin/operator create                                                                 |
| POST /clients/:id                           | Admin/operator; full update with expectedVersion                                                          |
| GET /clients/:id/export                     | Bearer; versioned JSON client plus its projects                                                           |
| GET /projects; POST /projects               | Authenticated read; admin/operator create                                                                 |
| GET /projects/:id; GET /projects/:id/export | Bearer; record or versioned JSON export                                                                   |
| POST /projects/:id                          | Admin/operator; full document update with expectedVersion                                                 |
| POST /projects/:id/approve                  | Admin/operator; expectedVersion, approvedBy, approvalEvidence                                             |
| GET /openapi.json                           | Public local contract                                                                                     |

Roles: admin, operator, viewer. Viewer can read service records/exports but cannot write; this is internal staff access, not a customer tenant portal. List clients/projects is capped at 500. Export formatVersion is 1.

Delivery writes use optimistic version checks, row locks and transactional audit. Approval requires proposal, deliverables and acceptance checks. Approved title/scope/proposal/check definitions are immutable: revised terms require a new project. Activation requires recorded approval. Ready/delivered require completed deliverables and acceptance checks with evidence; delivery also requires ownership/access/documentation/backup/support acknowledgements, maintenance scope and handover notes. Delivered/archived content is read-only. Approval is staff-recorded evidence, not a verified customer signature or payment.

Input is strict and bounded; global body limit is 128 KiB. Defaults: 100 requests/minute per client and 5 login attempts/minute, with an additional PostgreSQL-backed hashed-IP fixed window. Bearer tokens last eight hours, are stored hashed server-side and checked against current enabled account state. Expired sessions and login-attempt rows older than a day are cleaned on readiness and every minute.

Errors are JSON {error}; invalid input 400, missing/invalid session 401, insufficient role 403, absent record 404, stale version/workflow conflict 409, throttling 429 and unavailable service 503. Protected responses use no-store. No passwords, hashes or raw tokens appear in user/audit responses.

References: [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [OpenAPI](https://spec.openapis.org/oas/latest.html).
