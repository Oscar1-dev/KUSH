/** Offline owner recovery: requires direct database access, explicit confirmation and a new password. */
import { createDatabase } from "@kush/database";
import { hashPassword } from "./password.js";
const {
  DATABASE_URL,
  KUSH_ADMIN_EMAIL,
  KUSH_ADMIN_PASSWORD,
  KUSH_RECOVERY_CONFIRM,
} = process.env;
if (
  !DATABASE_URL ||
  !KUSH_ADMIN_EMAIL ||
  !KUSH_ADMIN_PASSWORD ||
  KUSH_RECOVERY_CONFIRM !== "I_HAVE_LOCAL_DATABASE_OWNER_ACCESS"
)
  throw new Error(
    "Set DATABASE_URL, KUSH_ADMIN_EMAIL, KUSH_ADMIN_PASSWORD and KUSH_RECOVERY_CONFIRM=I_HAVE_LOCAL_DATABASE_OWNER_ACCESS. No default password exists.",
  );
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(KUSH_ADMIN_EMAIL) ||
  KUSH_ADMIN_PASSWORD.length < 14 ||
  KUSH_ADMIN_PASSWORD.length > 1024
)
  throw new Error("Use a valid email and password of 14–1024 characters");
const { pool } = createDatabase(DATABASE_URL);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(4310002)");
  const result = await client.query(
    "UPDATE users SET password_hash=$2,role='admin',disabled=false WHERE email=$1 RETURNING id",
    [
      KUSH_ADMIN_EMAIL.trim().toLowerCase(),
      await hashPassword(KUSH_ADMIN_PASSWORD),
    ],
  );
  if (!result.rowCount)
    throw new Error(
      "Account not found. Use the explicit bootstrap command for a new account.",
    );
  await client.query("DELETE FROM sessions WHERE user_id=$1", [
    result.rows[0].id,
  ]);
  await client.query(
    "INSERT INTO audit_events(actor_id,action) VALUES($1,'admin.offline_recovery')",
    [result.rows[0].id],
  );
  await client.query("COMMIT");
  console.log(
    "Administrator recovered; all account sessions revoked. Remove password and confirmation from the environment.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
