import "reflect-metadata";
import { sql } from "drizzle-orm";
import { withPlatform } from "./database/rls.js";
import { closePool } from "./database/pool.js";
import { loadEnv } from "./config/env.js";

/**
 * Outbox dispatcher (skeleton). Polls event_outbox for pending rows and relays
 * them to downstream handlers (notifications, reconciliation, analytics). Phase
 * 0 proves the loop and the claim-with-SKIP-LOCKED pattern; real handlers arrive
 * with the notifications module. Runs as a separate Render worker service.
 */
const POLL_MS = 2000;
const BATCH = 50;

let running = true;

async function tick(): Promise<void> {
  await withPlatform(undefined, async (db) => {
    // Claim a batch without two workers grabbing the same rows.
    const rows = await db.execute(sql`
      SELECT id, tenant_id, aggregate_type, event_type
      FROM event_outbox
      WHERE status = 'pending'
      ORDER BY occurred_at
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    `);

    const claimed = rows.rows as Array<{ id: string; event_type: string }>;
    for (const row of claimed) {
      // TODO: route row.event_type to its handler. For now, just mark dispatched.
      await db.execute(sql`
        UPDATE event_outbox
        SET status = 'dispatched', dispatched_at = now()
        WHERE id = ${row.id}
      `);
    }
    if (claimed.length > 0) {
      console.log(`dispatched ${claimed.length} event(s)`);
    }
  });
}

async function main(): Promise<void> {
  loadEnv();
  console.log("ATLAS outbox dispatcher started");
  while (running) {
    try {
      await tick();
    } catch (err) {
      console.error("dispatcher tick failed", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await closePool();
}

process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});

main().catch((err) => {
  console.error("dispatcher fatal", err);
  process.exit(1);
});
