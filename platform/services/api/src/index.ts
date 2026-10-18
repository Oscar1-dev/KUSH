import { buildApp } from "./app.js";
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is required; configure local PostgreSQL first");
const app = await buildApp(url, true);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close();
  });
await app.listen({ host: "127.0.0.1", port: 4310 });
