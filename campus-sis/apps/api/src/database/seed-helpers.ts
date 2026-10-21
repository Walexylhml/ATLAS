import type { Pool, PoolClient } from "pg";

/**
 * Raw-client transaction helpers for scripts (seed, backfills) that write SQL
 * directly rather than through Drizzle. Same RLS session-variable discipline as
 * src/database/rls.ts, exposing the pg client instead of a Drizzle instance.
 */

export async function withPlatform<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return tx(pool, async (client) => {
    await client.query("SELECT set_config('app.is_platform', 'on', true)");
    return fn(client);
  });
}

export async function withPtenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return tx(pool, async (client) => {
    await client.query("SELECT set_config('app.is_platform', 'off', true)");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    return fn(client);
  });
}

async function tx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
