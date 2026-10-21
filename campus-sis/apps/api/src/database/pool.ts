import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";
import { loadEnv } from "../config/env.js";

/**
 * A single shared pool for the process. The app connects as an ordinary
 * (non-superuser) role in production; combined with FORCE ROW LEVEL SECURITY in
 * the migrations, tenant isolation holds even if that assumption slips.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const env = loadEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.NODE_ENV === "production" ? 10 : 5,
      // Managed Postgres (Render/Railway) terminates TLS; allow it without a CA
      // pin for now. Harden to verify-full once we pin the provider (ADR-0003).
      ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function createDb(p: Pool = getPool()) {
  return drizzle(p, { schema });
}

export type Database = ReturnType<typeof createDb>;

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
