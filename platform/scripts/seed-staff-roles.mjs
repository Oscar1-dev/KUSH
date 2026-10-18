// Maps the KUSH Discord server's role IDs to staff-dashboard roles.
// Reads role IDs from the bot's configuration (.local/discord.json), so no
// role is matched by its display name. Safe to re-run: it replaces the
// tenant's mapping with exactly this table.
//
//   node scripts/seed-staff-roles.mjs            (dry run: print the mapping)
//   node scripts/seed-staff-roles.mjs --apply    (write it)
import { readFile } from "node:fs/promises";
import { configuration, databaseClient } from "./runtime.mjs";

const MAP = {
  owner: "owner",
  "co-owner": "administrator", // conservative: owner stays exclusive
  administrator: "administrator",
  management: "manager",
  "commission-manager": "manager",
  developer: "developer",
  "support-lead": "support",
  "support-team": "support",
  "support-staff": "support",
  moderator: "moderator",
};

const discord = JSON.parse(
  await readFile(new URL("../.local/discord.json", import.meta.url), "utf8"),
);
const rows = [];
for (const [key, staffRole] of Object.entries(MAP)) {
  const roleId = discord.roleIds[key];
  if (!roleId) throw new Error(`Role "${key}" is not configured in discord.json`);
  if (!rows.some((r) => r.roleId === roleId && r.staffRole === staffRole))
    rows.push({ key, roleId, staffRole });
}
console.table(rows);
if (!process.argv.includes("--apply")) {
  console.log("Dry run. Re-run with --apply to write this mapping.");
  process.exit(0);
}
const client = databaseClient(await configuration());
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM staff_role_mappings WHERE tenant_id=$1", [
    discord.supportTenantId,
  ]);
  for (const row of rows)
    await client.query(
      "INSERT INTO staff_role_mappings(tenant_id,discord_role_id,staff_role) VALUES($1,$2,$3)",
      [discord.supportTenantId, row.roleId, row.staffRole],
    );
  await client.query(
    "INSERT INTO audit_events(action,tenant_id) VALUES('staff.role_mapping.replaced',$1)",
    [discord.supportTenantId],
  );
  await client.query("COMMIT");
  console.log(`Applied ${rows.length} mappings.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

