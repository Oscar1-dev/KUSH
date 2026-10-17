import {
  configuration,
  databaseClient,
  databaseUrl,
  startDatabase,
  runPnpm,
  launch,
  completed,
  apiRequire,
  root,
} from "./runtime.mjs";
import { randomBytes } from "node:crypto";
process.chdir(root);
const command = process.argv[2] ?? "api";
if (
  ![
    "api",
    "test",
    "native-test",
    "bootstrap",
    "recover",
    "backup",
    "restore",
    "recovery-check",
    "upgrade-encoding",
  ].includes(command)
)
  throw new Error(
    "Use pnpm local api|test|bootstrap|recover|backup|restore|recovery-check.",
  );
const credentials = await configuration();
const stopDatabase = await startDatabase(credentials);
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl(credentials),
  KUSH_TEST_DATABASE_URL: databaseUrl(credentials),
};
let api;
let stopping;
if (command === "api")
  process.stdin.on("data", (chunk) => {
    if (chunk.toString().trim() === "stop") void shutdown();
  });
async function shutdown() {
  if (!stopping)
    stopping = (async () => {
      if (api && api.exitCode === null && api.signalCode === null) {
        api.kill();
        await new Promise((resolve) => api.once("exit", resolve));
      }
      await stopDatabase();
    })();
  await stopping;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void shutdown().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  });
try {
  await runPnpm(["--filter", "@kush/database", "migrate"], env);
  if (command === "test" || command === "native-test") {
    const database = `kush_test_${randomBytes(8).toString("hex")}`;
    const control = databaseClient(credentials);
    await control.connect();
    try {
      await control.query(
        `CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
      );
      const testEnv = {
        ...env,
        KUSH_LOCAL_DATABASE: database,
        DATABASE_URL: databaseUrl(credentials, database),
        KUSH_TEST_DATABASE_URL: databaseUrl(credentials, database),
      };
      try {
        await runPnpm(["--filter", "@kush/database", "migrate"], testEnv);
        if (command === "test") await runPnpm(["test"], testEnv);
        else {
          api = launch(
            process.execPath,
            [apiRequire.resolve("tsx/cli"), "services/api/src/index.ts"],
            { env: testEnv, stdio: "ignore" },
          );
          try {
            let ready = false;
            for (let attempt = 0; attempt < 50; attempt++) {
              if (api.exitCode !== null)
                throw new Error(
                  "Native-test API exited before readiness. Ensure port4310 is free.",
                );
              try {
                if ((await fetch("http://127.0.0.1:4310/health")).ok) {
                  ready = true;
                  break;
                }
              } catch {
                /* Wait for this test API. */
              }
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (!ready)
              throw new Error("Native-test API did not become ready.");
            await completed(
              launch(process.execPath, ["scripts/verify-native.mjs"], {
                env: testEnv,
              }),
            );
          } finally {
            if (api.exitCode === null) {
              api.kill();
              await new Promise((resolve) => api.once("exit", resolve));
            }
          }
        }
      } finally {
        await control.query(`DROP DATABASE "${database}"`);
      }
    } finally {
      await control.end();
    }
  } else if (command === "bootstrap")
    await runPnpm(["--filter", "@kush/api", "bootstrap-admin"], env);
  else if (command === "recover")
    await completed(
      launch(
        process.execPath,
        [apiRequire.resolve("tsx/cli"), "services/api/src/recover-admin.ts"],
        { env },
      ),
    );
  else if (command === "api") {
    api = launch(
      process.execPath,
      [apiRequire.resolve("tsx/cli"), "services/api/src/index.ts"],
      { env },
    );
    await completed(api).catch((error) => {
      if (!stopping) throw error;
    });
  } else
    await completed(
      launch(
        process.execPath,
        ["scripts/backup.mjs", command, ...process.argv.slice(3)],
        { env },
      ),
    );
} finally {
  await shutdown();
  process.stdin.pause();
}
