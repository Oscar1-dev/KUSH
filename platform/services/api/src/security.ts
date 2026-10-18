import type { createDatabase } from "@kush/database";
export type DatabaseContext = ReturnType<typeof createDatabase>;
/** Atomic fixed window shared by all API processes; never stores a raw IP. */
export async function consumeLoginAttempt(
  pool: DatabaseContext["pool"],
  ipHash: string,
) {
  const result = await pool.query<{ attempts: number }>(
    `INSERT INTO login_attempts (ip_hash) VALUES ($1)
    ON CONFLICT(ip_hash) DO UPDATE SET
    attempts = CASE WHEN login_attempts.window_start < now() - interval '1 minute' THEN 1 ELSE login_attempts.attempts + 1 END,
    window_start = CASE WHEN login_attempts.window_start < now() - interval '1 minute' THEN now() ELSE login_attempts.window_start END
    RETURNING attempts`,
    [ipHash],
  );
  return result.rows[0]!.attempts <= 5;
}
