# Controlled support installation

M4 deployment is governed by [DEPLOYMENT.md](DEPLOYMENT.md), the exact [permission model](PERMISSIONS.md), [operations runbook](OPERATIONS.md), and [M4 threat model](../security/M4-THREAT-MODEL.md). Those documents supersede this M3-only future-installation outline where their scope overlaps.

Current scope is a local ticket-management slice. No Discord bot application, token, command, live server or channel is installed. The existing server blueprint and permission matrix remain proposed designs. Entering a guild snowflake leaves its status **unverified**.

## Local preparation

1. Follow the repository README for explicit database migrations, administrator bootstrap and loopback API/desktop startup. Never reuse a customer's credentials.
2. Use the existing clients/projects workflow for scope, ownership, approval, acceptance checks and handover. Link the support tenant to its matching client/project; do not invent a separate delivery record.
3. Create a tenant with deliberate category keys, reopen policy and retention setting. A null retention period means no automatic deletion, not an agreed indefinite legal retention policy. The current software does not execute retention deletion.
4. Add existing enabled accounts with deliberate tenant roles. Customer accounts use the global customer role; owner/staff use operator/admin accounts. Global administrators still require tenant membership. Staff see only tickets assigned to them; owners manage the tenant queue.
5. Exercise ticket creation, customer-visible reply, internal note, assignment, close confirmation/reason, policy-controlled reopening and restricted JSON export using clearly labelled test records. Verify another customer and unassigned staff cannot read the ticket.
6. Record actual acceptance evidence in the linked project and provide the operator with setup, backup/recovery and export documentation. Agree maintenance obligations explicitly. No continuous uptime is promised from local hosting.

## Future authorised Discord installation

The customer must own their server and relevant accounts. Before live work, obtain approval for the exact new server/application and proposed operations. Preserve the old server. Implement and verify the separate bot runtime, least-privilege invitation, guild ownership check, effective channel permissions, stable resource mapping, dry-run changes, rate-limit/error handling and secret redaction first.

Keep bot credentials outside the desktop and repository. Grant KUSH only the agreed access; remove temporary access at handover. Review destructive changes separately and never delete unknown resources. A paid or always-on host requires a separate agreement; this slice introduces no paid dependency.

Exported tickets are JSON downloaded through authenticated access. There is no public transcript link, live configuration export, bot health heartbeat, blueprint apply engine or message synchronisation yet.
