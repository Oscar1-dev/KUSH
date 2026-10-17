import {
  mkdir,
  readFile,
  writeFile,
  stat,
  unlink,
  rename,
} from "node:fs/promises";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  createHash,
} from "node:crypto";
import path from "node:path";
import {
  configuration,
  databaseClient,
  databaseUrl,
  local,
  runPnpm,
} from "./runtime.mjs";

// Deliberately application-specific. No SQL supplied by a backup is executed.
const tables = [
  "users",
  "connection_profiles",
  "clients",
  "projects",
  "support_tenants",
  "support_members",
  "support_tickets",
  "support_messages",
  "support_events",
  "commercial_requests",
  "discord_account_links",
  "discord_link_attempts",
  "discord_identities",
  "discord_ticket_channels",
  "audit_events",
];
const transient = ["sessions", "login_attempts"];
const backupDirectory = path.join(local, "backups");
const credentials = await configuration();
await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
function filename(name) {
  if (!/^[a-zA-Z0-9_-]{1,100}\.kushbak$/.test(name))
    throw new Error("Use a .kushbak basename under .local/backups.");
  return path.join(backupDirectory, name);
}
function key(password, salt) {
  if (typeof password !== "string" || password.length < 16)
    throw new Error(
      "Set KUSH_BACKUP_PASSPHRASE to at least 16 characters using a secure prompt.",
    );
  return scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}
function seal(value, password) {
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  cipher.setAAD(Buffer.from("KUSH_BACKUP_V1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    format: "KUSH_BACKUP_V1",
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: encrypted.toString("base64"),
  });
}
function unseal(text, password) {
  const envelope = JSON.parse(text);
  if (
    envelope.format !== "KUSH_BACKUP_V1" ||
    !/^[a-f0-9]{32}$/.test(envelope.salt) ||
    !/^[a-f0-9]{24}$/.test(envelope.iv) ||
    !/^[a-f0-9]{32}$/.test(envelope.tag) ||
    typeof envelope.data !== "string"
  )
    throw new Error("Unsupported backup envelope.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(password, Buffer.from(envelope.salt, "hex")),
    Buffer.from(envelope.iv, "hex"),
  );
  decipher.setAAD(Buffer.from("KUSH_BACKUP_V1"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
async function schema(client) {
  const names = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((x) => x.tablename);
  if (
    JSON.stringify(names) !==
    JSON.stringify([...tables, ...transient, "kush_migrations"].sort())
  )
    throw new Error(
      "Application schema changed. Update the backup format before continuing.",
    );
  return {
    migrations: (
      await client.query(
        "SELECT name,sha256 FROM kush_migrations ORDER BY name",
      )
    ).rows,
    columns: (
      await client.query(
        "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      )
    ).rows,
  };
}
async function snapshot(client) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const result = {
      format: 1,
      createdAt: new Date().toISOString(),
      schema: await schema(client),
      tables: {},
    };
    let total = 0;
    for (const table of tables) {
      const count = Number(
        (await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n,
      );
      total += count;
      if (total > 100000)
        throw new Error(
          "Application snapshot exceeds 100,000 rows. Use PostgreSQL native backup tooling.",
        );
      result.tables[table] = (
        await client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t`)
      ).rows.map((x) => x.row);
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
function digest(snapshotValue) {
  const rows = tables.map((table) => [
    table,
    snapshotValue.tables[table].map((row) => JSON.stringify(row)).sort(),
  ]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
async function writeBackup(client, name, password) {
  const value = await snapshot(client);
  const encrypted = seal(value, password);
  if (Buffer.byteLength(encrypted) > 50 * 1024 * 1024)
    throw new Error(
      "Application backup exceeds the 50 MiB restore limit. Use PostgreSQL native backup tooling.",
    );
  await writeFile(filename(name), encrypted, {
    flag: "wx",
    mode: 0o600,
  });
  return value;
}
async function restore(control, name, target, password) {
  if (!/^kush_restore_[a-z0-9_]{1,40}$/.test(target))
    throw new Error(
      "Restore only into a NEW database named kush_restore_<name>. Existing databases are never overwritten.",
    );
  if ((await stat(filename(name))).size > 50 * 1024 * 1024)
    throw new Error("Backup exceeds 50 MiB application snapshot limit.");
  const value = unseal(await readFile(filename(name), "utf8"), password);
  if (
    value.format !== 1 ||
    JSON.stringify(Object.keys(value.tables ?? {})) !== JSON.stringify(tables)
  )
    throw new Error("Unsupported application snapshot.");
  if (JSON.stringify(value.schema) !== JSON.stringify(await schema(control)))
    throw new Error(
      "Backup schema does not match this build. Restore with its matching KUSH version first.",
    );
  let total = 0;
  for (const table of tables) {
    if (!Array.isArray(value.tables[table]))
      throw new Error("Invalid snapshot rows.");
    total += value.tables[table].length;
    const columns = value.schema.columns
      .filter((c) => c.table_name === table)
      .map((c) => c.column_name)
      .sort();
    for (const row of value.tables[table])
      if (
        !row ||
        typeof row !== "object" ||
        JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(columns)
      )
        throw new Error("Invalid snapshot columns.");
  }
  if (total > 100000) throw new Error("Snapshot too large.");
  await control.query(
    `CREATE DATABASE "${target}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
  );
  // On failure the new database is retained for diagnosis; source is never modified.
  await runPnpm(["--filter", "@kush/database", "migrate"], {
    ...process.env,
    DATABASE_URL: databaseUrl(credentials, target),
  });
  const destination = databaseClient(credentials, target);
  await destination.connect();
  try {
    await destination.query("BEGIN");
    for (const table of tables) {
      if (
        Number(
          (await destination.query(`SELECT count(*) AS n FROM "${table}"`))
            .rows[0].n,
        ) !== 0
      )
        throw new Error("Restore destination must be empty.");
      if (value.tables[table].length)
        await destination.query(
          `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}",$1::jsonb)`,
          [JSON.stringify(value.tables[table])],
        );
    }
    await destination.query("COMMIT");
    const restored = await snapshot(destination);
    if (digest(restored) !== digest(value))
      throw new Error("Restored content digest did not match.");
    console.log(
      `Verified application snapshot restored into ${target}; sessions and login attempts were not restored.`,
    );
    return value;
  } catch (error) {
    await destination.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await destination.end();
  }
}
const source = databaseClient(credentials);
await source.connect();
try {
  const command = process.argv[2];
  if (command === "backup") {
    const name =
      process.argv[3] ??
      `kush-${Date.now()}-${randomBytes(3).toString("hex")}.kushbak`;
    await writeBackup(source, name, process.env.KUSH_BACKUP_PASSPHRASE);
    console.log(
      `Encrypted application backup saved under .local/backups/${name}. Keep the passphrase separately.`,
    );
  } else if (command === "upgrade-encoding") {
    const encoding = (await source.query("SHOW server_encoding")).rows[0]
      .server_encoding;
    if (encoding === "UTF8")
      console.log("Local database already uses UTF8; no copy needed.");
    else {
      if (process.env.KUSH_LOCAL_DATABASE)
        throw new Error(
          "Clear KUSH_LOCAL_DATABASE before upgrading the default configured database.",
        );
      const suffix = randomBytes(6).toString("hex"),
        password = randomBytes(32).toString("hex");
      const name = `encoding-upgrade-${suffix}.kushbak`,
        target = `kush_restore_utf8_${suffix}`;
      await writeBackup(source, name, password);
      try {
        await restore(source, name, target, password);
        const updated = path.join(local, `database-${suffix}.tmp`);
        await writeFile(
          updated,
          JSON.stringify({ ...credentials, database: target }),
          { flag: "wx", mode: 0o600 },
        );
        await rename(updated, path.join(local, "database.json"));
        console.log(
          `Configured verified UTF8 copy ${target}. Original database retained unchanged. Restart the local API to use it.`,
        );
      } finally {
        await unlink(filename(name));
      }
    }
  } else if (command === "restore")
    await restore(
      source,
      process.argv[3],
      process.argv[4],
      process.env.KUSH_BACKUP_PASSPHRASE,
    );
  else if (command === "recovery-check") {
    const password = randomBytes(32).toString("hex"),
      suffix = randomBytes(6).toString("hex");
    const name = `rehearsal-${suffix}.kushbak`,
      target = `kush_restore_rehearsal_${suffix}`;
    const fixtureName = `kush_test_backup_${suffix}`;
    await source.query(
      `CREATE DATABASE "${fixtureName}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    const fixture = databaseClient(credentials, fixtureName);
    let restored = false;
    try {
      await runPnpm(["--filter", "@kush/database", "migrate"], {
        ...process.env,
        DATABASE_URL: databaseUrl(credentials, fixtureName),
      });
      await fixture.connect();
      const user = (
        await fixture.query(
          "INSERT INTO users(email,password_hash,role) VALUES('backup-test@test.invalid','TEST_ONLY_NOT_A_LOGIN','admin') RETURNING id",
        )
      ).rows[0].id;
      const customer = (
        await fixture.query(
          "INSERT INTO clients(organisation,contact_email,notes) VALUES('BACKUP TEST Ω','backup@test.invalid',$1) RETURNING id",
          ["Unicode and newline\nTEST ONLY"],
        )
      ).rows[0].id;
      await fixture.query(
        "INSERT INTO projects(client_id,document) VALUES($1,$2)",
        [
          customer,
          JSON.stringify({
            title: "BACKUP TEST",
            scope: "TEST ONLY",
            status: "draft",
            proposal: null,
            approval: null,
            tasks: [],
            deliverables: [],
            acceptanceChecks: [],
            handover: {
              ownership: false,
              access: false,
              documentation: false,
              backup: false,
              support: false,
              maintenanceScope: "",
            },
            handoverNotes: "",
          }),
        ],
      );
      await fixture.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('TEST_TRANSIENT_SESSION',$1,now()+interval '1 hour')",
        [user],
      );
      await fixture.query(
        "INSERT INTO audit_events(actor_id,action) VALUES($1,'test.backup.fixture')",
        [user],
      );
      await fixture.query(
        "INSERT INTO connection_profiles(name,endpoint) VALUES('BACKUP TEST','http://127.0.0.1:4310')",
      );
      const tenant = (
        await fixture.query(
          "INSERT INTO support_tenants(name,config) VALUES('BACKUP TEST SUPPORT',$1) RETURNING id",
          [
            JSON.stringify({
              categories: [{ key: "support", label: "Support" }],
              retentionDays: null,
              allowReopen: true,
            }),
          ],
        )
      ).rows[0].id;
      await fixture.query(
        "INSERT INTO support_members(tenant_id,user_id,role) VALUES($1,$2,'owner')",
        [tenant, user],
      );
      const ticket = (
        await fixture.query(
          "INSERT INTO support_tickets(tenant_id,number,customer_id,category,create_category,description,create_request_id) VALUES($1,1,$2,'support','support','BACKUP TEST',gen_random_uuid()) RETURNING id",
          [tenant, user],
        )
      ).rows[0].id;
      await fixture.query(
        "INSERT INTO support_messages(tenant_id,ticket_id,author_id,kind,content,request_id) VALUES($1,$2,$3,'note','BACKUP PRIVATE NOTE',gen_random_uuid())",
        [tenant, ticket, user],
      );
      await fixture.query(
        "INSERT INTO support_events(tenant_id,ticket_id,actor_id,audience,action) VALUES($1,$2,$3,'staff','ticket.note')",
        [tenant, ticket, user],
      );
      await fixture.query(
        "INSERT INTO commercial_requests(tenant_id,requester_id,kind,title,details,category,create_request_id) VALUES($1,$2,'commission','BACKUP TEST COMMISSION','BACKUP TEST DETAILS','development',gen_random_uuid())",
        [tenant, user],
      );
      await fixture.query(
        "INSERT INTO discord_account_links(tenant_id,user_id,state,code_hash,request_id,expires_at) VALUES($1,$2,'pending',$3,gen_random_uuid(),now()+interval '10 minutes')",
        [tenant, user, "0".repeat(64)],
      );
      const before = await writeBackup(fixture, name, password);
      let rejected = false;
      try {
        unseal(
          await readFile(filename(name), "utf8"),
          "deliberately-incorrect-passphrase",
        );
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Wrong passphrase was accepted.");
      const copy = await restore(fixture, name, target, password);
      restored = true;
      if (digest(before) !== digest(copy))
        throw new Error("Snapshot mismatch.");
      const restoredClient = databaseClient(credentials, target);
      await restoredClient.connect();
      try {
        if (
          Number(
            (await restoredClient.query("SELECT count(*) AS n FROM sessions"))
              .rows[0].n,
          ) !== 0
        )
          throw new Error("Session unexpectedly restored.");
      } finally {
        await restoredClient.end();
      }
      let existingRejected = false;
      try {
        await restore(fixture, name, target, password);
      } catch (error) {
        if (error.code === "42P04") existingRejected = true;
        else throw error;
      }
      if (!existingRejected)
        throw new Error("Existing restore destination was not rejected.");
      if (digest(await snapshot(fixture)) !== digest(before))
        throw new Error("Source changed during recovery check.");
      console.log(
        "PASS encrypted backup/restore: nonempty users/profiles/clients/projects/support/commercial/Discord-link/audit restored with matching digest, Unicode preserved, wrong passphrase and existing destination rejected, sessions excluded, source unchanged.",
      );
    } finally {
      // Only this rehearsal-created database and file are removed.
      if (restored) await source.query(`DROP DATABASE "${target}"`);
      await fixture.end();
      await source.query(`DROP DATABASE "${fixtureName}"`);
      await unlink(filename(name)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  } else throw new Error("Use backup, restore or recovery-check.");
} finally {
  await source.end();
}
