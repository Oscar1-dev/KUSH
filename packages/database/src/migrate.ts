import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createDatabase } from "./index.js";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { pool } = createDatabase(url);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(4310001)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS kush_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), sha256 text)",
  );
  await client.query(
    "ALTER TABLE kush_migrations ADD COLUMN IF NOT EXISTS sha256 text",
  );
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const applied = await client.query<{ name: string; sha256: string | null }>(
    "SELECT name, sha256 FROM kush_migrations",
  );
  for (const row of applied.rows) {
    if (!files.includes(`${row.name}.sql`))
      throw new Error(`Applied migration missing: ${row.name}`);
  }
  for (const file of files) {
    const name = file.slice(0, -4);
    const sql = await readFile(new URL(file, directory), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const previous = applied.rows.find((row) => row.name === name);
    if (previous) {
      if (previous.sha256 && previous.sha256 !== sha256)
        throw new Error(`Applied migration modified: ${name}`);
      // Adopt a checksum once for the original pre-checksum ledger; never re-execute it.
      if (!previous.sha256)
        await client.query(
          "UPDATE kush_migrations SET sha256=$1 WHERE name=$2",
          [sha256, name],
        );
    } else {
      await client.query(sql);
      await client.query(
        "INSERT INTO kush_migrations(name,sha256) VALUES ($1,$2)",
        [name, sha256],
      );
    }
  }
  await client.query("COMMIT");
  console.log("Database migrations applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
