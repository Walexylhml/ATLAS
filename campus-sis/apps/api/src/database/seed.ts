/**
 * Idempotent development seed. Creates the baseline the platform cannot start
 * empty without: a plan, a platform super-admin, the system role templates and a
 * starter permission catalogue, plus one demo tenant with an admin account.
 *
 *   pnpm db:seed
 *
 * Safe to re-run: every insert uses ON CONFLICT DO NOTHING on a natural key.
 */
import { getPool, closePool } from "./pool.js";
import { newId } from "../common/ids.js";
import { withPlatform, withPtenant } from "./seed-helpers.js";

const DEMO_TENANT_SHORT = "demo-uni";

async function run(): Promise<void> {
  const pool = getPool();

  // --- Platform-level baseline (crosses tenants) ---
  const { tenantId } = await withPlatform(pool, async (client) => {
    const planId = newId();
    await client.query(
      `INSERT INTO plan (id, name, limits) VALUES ($1, 'Pilot', '{"maxStudents":5000}')
       ON CONFLICT DO NOTHING`,
      [planId],
    );

    await client.query(
      `INSERT INTO platform_user (id, name, email, mfa_enabled)
       VALUES ($1, 'Platform Super Admin', 'ops@atlas.africa', true)
       ON CONFLICT (email) DO NOTHING`,
      [newId()],
    );

    // System role templates (tenant_id NULL => shared across all tenants).
    const templates: Array<[string, string]> = [
      ["institution_admin", "Institution Administrator"],
      ["registrar", "Registrar"],
      ["bursar", "Bursar / Finance"],
      ["lecturer", "Lecturer"],
      ["student", "Student"],
      ["parent", "Parent / Guardian"],
    ];
    for (const [key, name] of templates) {
      await client.query(
        `INSERT INTO role (id, tenant_id, key, name, is_system)
         VALUES ($1, NULL, $2, $3, true)
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [newId(), key, name],
      );
    }

    // Starter permission catalogue (grows per module).
    const perms: Array<[string, string, string]> = [
      ["tenant.configure", "tenant", "configure"],
      ["person.read", "person", "read"],
      ["person.write", "person", "write"],
      ["account.manage", "account", "manage"],
      ["role.assign", "role", "assign"],
      ["audit.read", "audit", "read"],
    ];
    for (const [key, resource, action] of perms) {
      await client.query(
        `INSERT INTO permission (id, key, resource, action)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO NOTHING`,
        [newId(), key, resource, action],
      );
    }

    // Demo tenant.
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM tenant WHERE lower(short_name) = $1`,
      [DEMO_TENANT_SHORT],
    );
    let tId = existing.rows[0]?.id;
    if (!tId) {
      tId = newId();
      await client.query(
        `INSERT INTO tenant (id, name, short_name, type, state, status, plan_id)
         VALUES ($1, 'Demo University', $2, 'university', 'Lagos', 'active', $3)`,
        [tId, DEMO_TENANT_SHORT, planId],
      );
    }
    return { tenantId: tId };
  });

  // --- Tenant-scoped rows for the demo tenant (RLS in force) ---
  await withPtenant(pool, tenantId, async (client) => {
    // A person + admin account.
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM person WHERE tenant_id = $1 AND primary_email = 'admin@demo-uni.edu.ng'`,
      [tenantId],
    );
    let personId = existing.rows[0]?.id;
    if (!personId) {
      personId = newId();
      await client.query(
        `INSERT INTO person (id, tenant_id, surname, first_name, primary_email, status)
         VALUES ($1, $2, 'Admin', 'Demo', 'admin@demo-uni.edu.ng', 'active')`,
        [personId, tenantId],
      );
    }

    const acct = await client.query<{ id: string }>(
      `INSERT INTO user_account (id, tenant_id, person_id, username, email, auth_method, status)
       VALUES ($1, $2, $3, 'demo.admin', 'admin@demo-uni.edu.ng', 'password_otp', 'active')
       ON CONFLICT (tenant_id, username) DO UPDATE SET username = EXCLUDED.username
       RETURNING id`,
      [newId(), tenantId, personId],
    );
    const accountId = acct.rows[0]!.id;

    // Assign the institution_admin template role, tenant-scoped.
    const roleRow = await client.query<{ id: string }>(
      `SELECT id FROM role WHERE key = 'institution_admin' AND tenant_id IS NULL`,
    );
    const roleId = roleRow.rows[0]?.id;
    if (roleId) {
      await client.query(
        `INSERT INTO role_assignment (id, tenant_id, user_account_id, role_id, scope_type, status)
         SELECT $1, $2, $3, $4, 'tenant', 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM role_assignment
           WHERE tenant_id = $2 AND user_account_id = $3 AND role_id = $4
         )`,
        [newId(), tenantId, accountId, roleId],
      );
    }
  });

  console.log(`✔ seed complete — demo tenant ${tenantId} (short_name: ${DEMO_TENANT_SHORT})`);
  await closePool();
}

run().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
