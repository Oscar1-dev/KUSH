# Discord bot operations

## Local and self-hosted availability

The £0 deployment path runs the bot beside the existing KUSH API and PostgreSQL. It is available only while the Windows host is powered on, connected, and running all three processes. This does not provide 24/7 availability or production redundancy.

Run validation and a dry-run before every configuration apply. Run the bot as an unprivileged OS user where practical, bind the KUSH API to loopback/private transport, and prevent inbound public access to PostgreSQL. Restart policy must use bounded backoff to avoid a crash loop or Discord reconnect storm.

## Monitoring

Health should distinguish process alive, Discord gateway ready, approved guild present, KUSH API reachable, database migrations ready, configuration mapping valid, and event backlog. Do not represent a partial state as online. Public `/status` responses expose only coarse operational state; stack traces, host paths, guild internals, tokens, customer counts, and private incident details remain staff-only.

Alert staff only on actionable transitions: sustained disconnect, authentication failure, permission drift, failed reconciliation, poisoned event, backlog threshold, or repeated API failure. Deduplicate alerts. Do not send unsolicited customer DMs.

## Routine procedures

Daily when operating: check gateway/API health and failed-event queue. Weekly: review permission drift, bot role position, AutoMod actions, dependency advisories, disk space, encrypted application backup result, and configuration backup. Monthly: review staff/management role membership, application owners, OAuth installations, retention decisions, account-link records, command allowlists, and recovery rehearsal evidence.

Configuration backup contains only stable guild, role, channel, command, panel, and AutoMod IDs/settings. It excludes secrets, webhook URLs, message bodies, transcripts, application records, member lists, and customer data. Retain and protect it under the same operator policy as infrastructure metadata.

## Incident response

For suspected token exposure:

1. Stop the bot and revoke/reset the bot token in the Discord Developer Portal.
2. Rotate the dedicated KUSH API service credential.
3. Inspect application owners, installations, bot role, webhooks, guild audit log, and KUSH audit records.
4. Remove unauthorised permissions/resources by stable ID after preserving evidence.
5. Redeploy from a known-clean environment and run the full live permission checklist.

For private-data exposure, immediately close the exposed channel to `@everyone` and nonessential roles, stop publishing events, preserve audit evidence, determine affected records/principals, and follow the applicable notification and legal process. Do not delete evidence or announce unverified details publicly.

For Discord/API outage, keep backend records authoritative, queue only idempotent bounded work, show an honest unavailable response, and reconcile current versions after recovery. Never replay raw interaction tokens after their validity window.

## Change management

Every live change records actor, guild ID, dry-run artifact, reviewed diff, stable resource IDs, apply result, and verification result. Role/channel deletion, bulk purge, bans, token rotation, public panels, announcements, invites, and global command promotion receive explicit action-time confirmation. Unknown live resources are preserved and reported as conflicts.

Dependency upgrades, permission additions, privileged intents, public hosting, new external services, payment handling, and changes to retention receive a fresh security review. The bot never silently expands its own permissions.
