import { sql } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { withPlatform, withTenant } from "./rls.js";
import { closePool } from "./pool.js";

/**
 * Proves tenant isolation is enforced by the DATABASE, not by application code:
 * one tenant's context can never see or write another tenant's rows, even when
 * we hand the query the wrong tenant_id on purpose.
 *
 * Requires a migrated Postgres at DATABASE_URL. CI provides one; locally run
 * `pnpm db:up && pnpm db:migrate` first. Skipped when no DATABASE_URL is set.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("RLS tenant isolation", () => {
  const tenantA = newId();
  const tenantB = newId();

  beforeAll(async () => {
    await withPlatform(undefined, async (db) => {
      for (const [id, short] of [
        [tenantA, `t-a-${id8(tenantA)}`],
        [tenantB, `t-b-${id8(tenantB)}`],
      ] as const) {
        await db.execute(sql`
          INSERT INTO tenant (id, name, short_name, type, status)
          VALUES (${id}, ${"Test " + short}, ${short}, 'university', 'active')
        `);
      }
    });
  });

  afterAll(async () => {
    await withPlatform(undefined, async (db) => {
      await db.execute(sql`DELETE FROM person WHERE tenant_id IN (${tenantA}, ${tenantB})`);
      await db.execute(sql`DELETE FROM tenant WHERE id IN (${tenantA}, ${tenantB})`);
    });
    await closePool();
  });

  it("only returns rows belonging to the current tenant", async () => {
    await withTenant({ tenantId: tenantA }, async (db) => {
      await db.execute(sql`
        INSERT INTO person (id, tenant_id, surname, first_name)
        VALUES (${newId()}, ${tenantA}, 'Aye', 'Ada')
      `);
    });
    await withTenant({ tenantId: tenantB }, async (db) => {
      await db.execute(sql`
        INSERT INTO person (id, tenant_id, surname, first_name)
        VALUES (${newId()}, ${tenantB}, 'Bello', 'Bisi')
      `);
    });

    const seenByA = await withTenant({ tenantId: tenantA }, async (db) => {
      const r = await db.execute(sql`SELECT surname FROM person`);
      return r.rows.map((x) => (x as { surname: string }).surname);
    });

    expect(seenByA).toEqual(["Aye"]);
    expect(seenByA).not.toContain("Bello");
  });

  it("forbids writing a row stamped with another tenant's id (WITH CHECK)", async () => {
    await expect(
      withTenant({ tenantId: tenantA }, async (db) => {
        await db.execute(sql`
          INSERT INTO person (id, tenant_id, surname, first_name)
          VALUES (${newId()}, ${tenantB}, 'Spoof', 'Mal')
        `);
      }),
    ).rejects.toThrow();
  });
});

function id8(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}
