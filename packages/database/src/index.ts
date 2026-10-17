import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
export * from "./schema.js";
export function createDatabase(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: 2000,
    max: 5,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
export type { Pool, PoolClient } from "pg";
