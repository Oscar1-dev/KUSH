# KUSH Developer

Private native Windows operations client for KUSH, backed by a real local API and PostgreSQL. Current work establishes M1 and a narrow M2 service-delivery slice; full M2 is not complete.

Implemented M1: authentication/logout, current-role access, account creation/access/password administration, own password change, explicit offline owner recovery, persistent loopback connection profiles, API/database health, audit and own activity. Password/access changes revoke sessions. Tokens remain in memory; profile records contain no credentials.

Implemented delivery: create/update/archive clients; create projects; record scope and proposal price/revision limit/terms; tasks with due dates; deliverables and acceptance checks with evidence; record external approval evidence; controlled project stages; handover checklist/maintenance scope/notes; JSON exports.

Workflow: draft → recorded approval → active → ready_for_handover → delivered. Approval requires proposal and check definitions. Approved scope/terms/definitions become immutable; create a new project for changed terms. Ready requires completed evidenced deliverables and acceptance checks. Delivered additionally requires the handover fields. Delivered/archived documents are read-only. Recorded approval is an internal operator record, not an electronic signature, verified customer acknowledgement or proof of sale.

Coordinator verification: 13 tests passed (6 desktop, 7 API) against disposable PostgreSQL; offline recovery confirmation rejection and success; actual native client → proposal → recorded test approval → active → evidence → ready → handover → delivered → JSON export. Native minimise/maximise/restore states were queried through Tauri. Signed-in axe scan reported zero violations.

Limitations: no physical multi-monitor, high-DPI, snapping, drag/resize matrix or manual screen-reader matrix verified; observed scale factor was 1. An axe result cannot establish complete accessibility. Full M2 scope templates, attachments, separate milestones and deployment target records are unfinished/out of this slice. Local connection profiles are not infrastructure management.

Discord, tickets, SSH, payments, suppliers, website, marketplace and public software products remain planned. No live integration, real customer approval, sales or validated demand is claimed. See ../roadmap/STATUS.md for exact current evidence and remaining work.
