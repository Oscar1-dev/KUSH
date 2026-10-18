import { configuration, databaseClient, databaseUrl } from "./runtime.mjs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const apiRequire = createRequire(
  new URL("../services/api/package.json", import.meta.url),
);
const credentials = await configuration();
const client = databaseClient(credentials);
await client.connect();
const suffix = randomBytes(6).toString("hex");
const email = `native-smoke-${suffix}@test.invalid`;
const password = randomBytes(32).toString("hex");
let id;
try {
  const bootstrap = spawn(
    process.execPath,
    [apiRequire.resolve("tsx/cli"), "services/api/src/bootstrap-admin.ts"],
    {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl(credentials),
        KUSH_ADMIN_EMAIL: email,
        KUSH_ADMIN_PASSWORD: password,
      },
    },
  );
  const bootstrapCode = await new Promise((resolve, reject) => {
    bootstrap.once("error", reject);
    bootstrap.once("exit", resolve);
  });
  if (bootstrapCode !== 0) throw new Error("Administrator bootstrap failed");
  const result = await client.query("SELECT id FROM users WHERE email=$1", [
    email,
  ]);
  id = result.rows[0].id;
  const child = spawn(process.execPath, ["scripts/native-smoke.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      KUSH_SMOKE_EMAIL: email,
      KUSH_SMOKE_PASSWORD: password,
      KUSH_SMOKE_SUFFIX: suffix,
      KUSH_SMOKE_USER_ID: id,
    },
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`Native verification failed (exit ${code}).`);
} finally {
  if (id) {
    const tenants = await client.query(
      "SELECT id FROM support_tenants WHERE name=$1",
      [`Native support ${suffix}`],
    );
    for (const tenant of tenants.rows) {
      await client.query("DELETE FROM support_events WHERE tenant_id=$1", [
        tenant.id,
      ]);
      await client.query("DELETE FROM support_messages WHERE tenant_id=$1", [
        tenant.id,
      ]);
      await client.query("DELETE FROM support_tickets WHERE tenant_id=$1", [
        tenant.id,
      ]);
      await client.query("DELETE FROM support_members WHERE tenant_id=$1", [
        tenant.id,
      ]);
      await client.query("DELETE FROM audit_events WHERE tenant_id=$1", [
        tenant.id,
      ]);
      await client.query("DELETE FROM support_tenants WHERE id=$1", [
        tenant.id,
      ]);
    }
    await client.query(
      "DELETE FROM projects WHERE client_id IN (SELECT id FROM clients WHERE organisation=$1)",
      [`Native test client ${suffix}`],
    );
    await client.query("DELETE FROM clients WHERE organisation=$1", [
      `Native test client ${suffix}`,
    ]);
    await client.query("DELETE FROM connection_profiles WHERE name=$1", [
      `Native profile ${suffix}`,
    ]);
    const staff = await client.query("SELECT id FROM users WHERE email=$1", [
      `native-staff-${suffix}@test.invalid`,
    ]);
    for (const account of staff.rows) {
      await client.query("DELETE FROM audit_events WHERE actor_id=$1", [
        account.id,
      ]);
      await client.query("DELETE FROM users WHERE id=$1", [account.id]);
    }
    await client.query("DELETE FROM audit_events WHERE actor_id=$1", [id]);
    await client.query("DELETE FROM users WHERE id=$1", [id]);
  }
  await client.end();
}
