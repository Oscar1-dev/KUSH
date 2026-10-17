import {
  mkdir,
  readFile,
  writeFile,
  access,
  open,
  unlink,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { userInfo } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const local = path.join(root, ".local");
const embeddedRequire = createRequire(import.meta.resolve("embedded-postgres"));
const { default: pg } = await import(
  pathToFileURL(embeddedRequire.resolve("pg")).href
);
const platform = process.platform === "win32" ? "windows" : process.platform;
const binaries = await import(
  pathToFileURL(
    embeddedRequire.resolve(`@embedded-postgres/${platform}-${process.arch}`),
  ).href
);
export const apiRequire = createRequire(
  new URL("../services/api/package.json", import.meta.url),
);
export async function configuration() {
  await mkdir(local, { recursive: true, mode: 0o700 });
  if (process.platform === "win32")
    execFileSync(
      "icacls",
      [local, "/inheritance:r", "/grant:r", `${userInfo().username}:(OI)(CI)F`],
      { windowsHide: true, stdio: "ignore" },
    );
  const filename = path.join(local, "database.json");
  let credentials;
  try {
    credentials = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    credentials = {
      user: "kush",
      password: randomBytes(32).toString("hex"),
      port: 54329,
    };
    await writeFile(filename, JSON.stringify(credentials), {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (
    credentials.user !== "kush" ||
    !/^[a-f0-9]{64}$/.test(credentials.password) ||
    credentials.port !== 54329
  )
    throw new Error("Invalid local database configuration; refusing to start.");
  return credentials;
}
export function databaseUrl(
  credentials,
  database = process.env.KUSH_LOCAL_DATABASE ??
    credentials.database ??
    "postgres",
) {
  if (
    database !== "postgres" &&
    !/^kush_(restore|test)_[a-z0-9_]{1,50}$/.test(database)
  )
    throw new Error("Invalid local database name.");
  return `postgresql://${credentials.user}:${credentials.password}@127.0.0.1:${credentials.port}/${database}`;
}
export function databaseClient(
  credentials,
  database = process.env.KUSH_LOCAL_DATABASE ??
    credentials.database ??
    "postgres",
) {
  return new pg.Client({
    connectionString: databaseUrl(credentials, database),
    connectionTimeoutMillis: 5000,
  });
}
export function launch(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
}
export async function completed(child) {
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0)
    throw new Error(`Local command failed (exit ${code ?? "signal"}).`);
}
export async function runPnpm(args, env) {
  const executable = process.env.npm_execpath;
  if (!executable) throw new Error("Run using pnpm local <command>.");
  await completed(
    launch(
      executable.endsWith(".exe") ? executable : process.execPath,
      executable.endsWith(".exe") ? args : [executable, ...args],
      { env },
    ),
  );
}
export async function startDatabase(credentials) {
  const lockPath = path.join(local, "runner.lock");
  try {
    const previous = JSON.parse(await readFile(lockPath, "utf8"));
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
      else throw error;
    }
    if (alive)
      throw new Error(
        "Another local runner is active. Stop it before another local command.",
      );
    await unlink(lockPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const lock = await open(lockPath, "wx", 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  await lock.close();
  const directory = path.join(local, "postgres");
  let started = false;
  async function stop() {
    if (started) {
      await completed(
        launch(binaries.pg_ctl, [
          "-D",
          directory,
          "stop",
          "-m",
          "fast",
          "-w",
          "-t",
          "15",
        ]),
      );
      started = false;
    }
    await unlink(lockPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  try {
    try {
      await access(path.join(directory, "PG_VERSION"));
    } catch {
      const passwordFile = path.join(local, "initdb-password");
      await writeFile(passwordFile, `${credentials.password}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      try {
        await completed(
          launch(binaries.initdb, [
            "-D",
            directory,
            "--username",
            credentials.user,
            "--auth=scram-sha-256",
            `--pwfile=${passwordFile}`,
            "--encoding=UTF8",
            "--locale=C",
          ]),
        );
      } finally {
        await unlink(passwordFile);
      }
    }
    await completed(
      launch(binaries.pg_ctl, [
        "-D",
        directory,
        "start",
        "-l",
        path.join(local, "postgres.log"),
        "-o",
        `-h 127.0.0.1 -p ${credentials.port}`,
        "-w",
        "-t",
        "15",
      ]),
    );
    started = true;
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
