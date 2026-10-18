# Local recovery and backups

These tools are for the local KUSH application schema. They do not constitute a general PostgreSQL backup service, disaster-recovery service or production uptime guarantee. Keep the project, lockfiles and migrations with the corresponding backup.

## Administrator recovery

With the API/local runner stopped, use the README password prompt to set KUSH_ADMIN_EMAIL and KUSH_ADMIN_PASSWORD. Set KUSH_RECOVERY_CONFIRM=I_HAVE_LOCAL_DATABASE_OWNER_ACCESS, then run pnpm local recover. It only recovers an existing account, enables it as an administrator and revokes all its sessions. It logs the recovery and never creates a default password. Clear both password and confirmation variables immediately afterwards. Anyone with database-owner access can already change stored accounts; this is an explicit, documented recovery path rather than a public reset endpoint.

The API also supports administrator password resets and an authenticated own-password change, both of which revoke sessions. A disabled account cannot authenticate. At least one enabled administrator must remain.

## Encrypted backup

Stop pnpm local api first. In PowerShell, prompt for a separate backup passphrase of at least 16 characters; do not put it in shell history:

```powershell
$kushBackupSecret = Read-Host 'Backup passphrase' -AsSecureString
$env:KUSH_BACKUP_PASSPHRASE = [System.Net.NetworkCredential]::new('', $kushBackupSecret).Password
try { pnpm local backup owner-backup.kushbak }
finally {
  Remove-Item Env:KUSH_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
  Remove-Variable kushBackupSecret -ErrorAction SilentlyContinue
}
```

The file is written under ignored, current-user-protected .local/backups, with exclusive creation; an existing file is not overwritten. Keep a separate secure copy of the passphrase and encrypted file. Losing the passphrase makes the backup unreadable. No off-device copy or recurring backup schedule is created automatically.

The snapshot uses a REPEATABLE READ transaction and includes users/password hashes, connection profiles, clients, complete project documents and audit. Sessions and login-attempt counters are deliberately excluded to avoid reviving existing sessions. AES-256-GCM authenticates and encrypts the payload; scrypt derives a key using a unique salt. Treat the passphrase as a secret. Plaintext snapshot data is not written to disk.

Bounds: 100,000 application rows and 50 MiB encrypted envelope. Unknown tables or incompatible migration/schema fingerprints are rejected. Larger databases and other PostgreSQL objects require supported native PostgreSQL backup tooling. The launcher binaries do not include pg_dump; this implementation makes no claim to preserve arbitrary extensions, roles, sequences or other databases.

## Restore without overwriting

Use the same secure prompt to set KUSH_BACKUP_PASSPHRASE, then:

```powershell
pnpm local restore owner-backup.kushbak kush_restore_owner_recovery
```

The destination must be a NEW name beginning kush_restore_. An existing database is rejected; nothing is dropped or overwritten. The tool creates UTF8/C-locale storage, applies matching migrations, loads only allowlisted application rows in a transaction and compares content digests. No SQL from a backup is executed. On restore failure, the newly created database is retained for diagnosis and the source remains unchanged.

To inspect/use a restored copy without replacing the original:

```powershell
$env:KUSH_LOCAL_DATABASE = 'kush_restore_owner_recovery'
pnpm local api
```

Sign in with a restored account. Previous sessions have not been restored. Clear KUSH_LOCAL_DATABASE to return to the configured default. Test recovery before relying on a backup; keep the old database until the restored workflow and data have been independently checked. Do not delete original data as part of this procedure.

## Verification and encoding

pnpm local recovery-check creates nonempty, explicitly marked fixtures in disposable databases. It verifies exact content recovery, Unicode/newlines, passphrase rejection, rejection of an existing destination, exclusion of sessions and source preservation, then removes only its own rehearsal databases/files.

pnpm local upgrade-encoding copies a legacy non-UTF8 application database into a verified new UTF8 database, atomically updates the local database configuration and leaves the source untouched. It is a no-op for an already UTF8 database. This upgrade was executed successfully for the original Windows-1252 development database. All future local test and restore databases explicitly use UTF8.

The runtime uses pg_ctl fast shutdown, which disconnects active development sessions and rolls back unfinished transactions. Type stop and press Enter in the API runner, or use Ctrl+C in an interactive terminal. Do not terminate PostgreSQL from Task Manager as the normal shutdown procedure.

References: https://www.postgresql.org/docs/current/backup-dump.html and https://www.postgresql.org/docs/current/app-pg-ctl.html .
