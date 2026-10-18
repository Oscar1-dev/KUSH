import { it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createDatabase } from "@kush/database";
import { hashPassword, verifyPassword } from "../src/password.js";
const run = promisify(execFile);
const require = createRequire(import.meta.url);
const url = process.env.KUSH_TEST_DATABASE_URL;
it.skipIf(!url)(
  "offline owner recovery refuses missing confirmation and revokes old sessions",
  async () => {
    const { pool } = createDatabase(url!);
    const email = `recovery-${randomUUID()}@test.invalid`,
      password = "new-recovery-test-passphrase";
    const result = await pool.query(
      "INSERT INTO users(email,password_hash,role,disabled) VALUES($1,$2,$3,true) RETURNING id",
      [email, await hashPassword("old-recovery-test-passphrase"), "viewer"],
    );
    const id = result.rows[0].id;
    try {
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        ["recovery-" + randomUUID(), id],
      );
      const env = {
        ...process.env,
        DATABASE_URL: url,
        KUSH_ADMIN_EMAIL: email,
        KUSH_ADMIN_PASSWORD: password,
        KUSH_RECOVERY_CONFIRM: "",
      };
      await expect(
        run(
          process.execPath,
          [require.resolve("tsx/cli"), "src/recover-admin.ts"],
          { env, windowsHide: true },
        ),
      ).rejects.toThrow();
      expect(
        (await pool.query("SELECT role,disabled FROM users WHERE id=$1", [id]))
          .rows[0],
      ).toEqual({ role: "viewer", disabled: true });
      await run(
        process.execPath,
        [require.resolve("tsx/cli"), "src/recover-admin.ts"],
        {
          env: {
            ...env,
            KUSH_RECOVERY_CONFIRM: "I_HAVE_LOCAL_DATABASE_OWNER_ACCESS",
          },
          windowsHide: true,
        },
      );
      const recovered = (
        await pool.query(
          "SELECT role,disabled,password_hash FROM users WHERE id=$1",
          [id],
        )
      ).rows[0];
      expect(recovered.role).toBe("admin");
      expect(recovered.disabled).toBe(false);
      expect(await verifyPassword(password, recovered.password_hash)).toBe(
        true,
      );
      expect(
        (await pool.query("SELECT * FROM sessions WHERE user_id=$1", [id]))
          .rowCount,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT * FROM audit_events WHERE actor_id=$1 AND action='admin.offline_recovery'",
            [id],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await pool.query("DELETE FROM audit_events WHERE actor_id=$1", [id]);
      await pool.query("DELETE FROM users WHERE id=$1", [id]);
      await pool.end();
    }
  },
  20000,
);
