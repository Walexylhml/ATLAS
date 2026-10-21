import type { Pool, PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";
import { getPool } from "./pool.js";

export interface TenantContext {
  tenantId: string;
  actorId?: string;
}

export type TxDb = NodePgDatabase<typeof schema>;

/**
 * Run `work` inside a transaction with the tenant's RLS session variables set.
 * `SET LOCAL` scopes them to this transaction only, so a pooled connection can
 * never carry one tenant's context into another's query.
 *
 * This is the ONLY sanctioned way to touch tenant-owned tables.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  work: (db: TxDb) => Promise<T>,
  pool: Pool = getPool(),
): Promise<T> {
  return runInTx(pool, async (client) => {
    await client.query("SELECT set_config('app.is_platform', 'off', true)");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [ctx.tenantId]);
    await client.query("SELECT set_config('app.actor_id', $1, true)", [ctx.actorId ?? ""]);
    return work(drizzle(client, { schema }));
  });
}

/**
 * Platform/ops context — can cross tenants (provisioning, the outbox dispatcher,
 * break-glass). Every use should be audited by the caller.
 */
export async function withPlatform<T>(
  actorId: string | undefined,
  work: (db: TxDb) => Promise<T>,
  pool: Pool = getPool(),
): Promise<T> {
  return runInTx(pool, async (client) => {
    await client.query("SELECT set_config('app.is_platform', 'on', true)");
    await client.query("SELECT set_config('app.actor_id', $1, true)", [actorId ?? ""]);
    return work(drizzle(client, { schema }));
  });
}

async function runInTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
