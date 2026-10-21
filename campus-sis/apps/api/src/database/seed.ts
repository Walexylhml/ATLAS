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

    // Starter permission catalogue (grows per module). The 4th element is an
    // optional relationship predicate baked onto the permission (ABAC).
    const perms: Array<[string, string, string, string | null]> = [
      ["tenant.configure", "tenant", "configure", null],
      ["person.read", "person", "read", null],
      ["person.write", "person", "write", null],
      ["person.read.child", "person", "read", "is_my_child"],
      ["account.manage", "account", "manage", null],
      ["role.assign", "role", "assign", null],
      ["audit.read", "audit", "read", null],
    ];
    for (const [key, resource, action, predicate] of perms) {
      await client.query(
        `INSERT INTO permission (id, key, resource, action, relationship_predicate)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO NOTHING`,
        [newId(), key, resource, action, predicate],
      );
    }

    // Attach permissions to the system role templates (role_permission is
    // reference data: no tenant_id, platform context). Tenants inherit these
    // when they clone a template; custom roles compose from the same catalogue.
    const grants: Array<[string, string[]]> = [
      [
        "institution_admin",
        ["tenant.configure", "person.read", "person.write", "account.manage", "role.assign", "audit.read"],
      ],
      ["registrar", ["person.read", "person.write", "audit.read"]],
      ["bursar", ["person.read"]],
      ["lecturer", ["person.read"]],
      ["student", ["person.read"]],
      ["parent", ["person.read.child"]],
    ];
    for (const [roleKey, permKeys] of grants) {
      await client.query(
        `INSERT INTO role_permission (role_id, permission_id)
         SELECT r.id, p.id
         FROM role r, permission p
         WHERE r.tenant_id IS NULL AND r.key = $1 AND p.key = ANY($2::text[])
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleKey, permKeys],
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
    // Idempotent helpers so the three demo users read cleanly.
    const ensurePerson = async (
      email: string,
      surname: string,
      firstName: string,
      phone: string | null,
    ): Promise<string> => {
      const found = await client.query<{ id: string }>(
        `SELECT id FROM person WHERE tenant_id = $1 AND primary_email = $2`,
        [tenantId, email],
      );
      if (found.rows[0]) return found.rows[0].id;
      const id = newId();
      await client.query(
        `INSERT INTO person (id, tenant_id, surname, first_name, primary_email, primary_phone, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [id, tenantId, surname, firstName, email, phone],
      );
      return id;
    };

    const ensureAccount = async (
      personId: string,
      username: string,
      email: string,
      phone: string,
    ): Promise<string> => {
      const acct = await client.query<{ id: string }>(
        `INSERT INTO user_account (id, tenant_id, person_id, username, email, phone, auth_method, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'otp', 'active')
         ON CONFLICT (tenant_id, username) DO UPDATE SET username = EXCLUDED.username
         RETURNING id`,
        [newId(), tenantId, personId, username, email, phone],
      );
      return acct.rows[0]!.id;
    };

    const assignRole = async (
      accountId: string,
      roleKey: string,
      scopeType: "tenant" | "self",
    ): Promise<void> => {
      const roleRow = await client.query<{ id: string }>(
        `SELECT id FROM role WHERE key = $1 AND tenant_id IS NULL`,
        [roleKey],
      );
      const roleId = roleRow.rows[0]?.id;
      if (!roleId) return;
      await client.query(
        `INSERT INTO role_assignment (id, tenant_id, user_account_id, role_id, scope_type, status)
         SELECT $1, $2, $3, $4, $5, 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM role_assignment
           WHERE tenant_id = $2 AND user_account_id = $3 AND role_id = $4
         )`,
        [newId(), tenantId, accountId, roleId, scopeType],
      );
    };

    // Institution admin (tenant scope) — the school's root user.
    const adminPerson = await ensurePerson(
      "admin@demo-uni.edu.ng",
      "Admin",
      "Demo",
      "+2348000000001",
    );
    const adminAccount = await ensureAccount(
      adminPerson,
      "demo.admin",
      "admin@demo-uni.edu.ng",
      "+2348000000001",
    );
    await assignRole(adminAccount, "institution_admin", "tenant");

    // Student (self scope) — can read only their own person record.
    const studentPerson = await ensurePerson(
      "student@demo-uni.edu.ng",
      "Okafor",
      "Chidi",
      "+2348000000002",
    );
    const studentAccount = await ensureAccount(
      studentPerson,
      "demo.student",
      "student@demo-uni.edu.ng",
      "+2348000000002",
    );
    await assignRole(studentAccount, "student", "self");

    // Parent (tenant scope, narrowed by the is_my_child predicate) + the
    // consented guardian link that ABAC checks against.
    const parentPerson = await ensurePerson(
      "parent@demo-uni.edu.ng",
      "Okafor",
      "Ngozi",
      "+2348000000003",
    );
    const parentAccount = await ensureAccount(
      parentPerson,
      "demo.parent",
      "parent@demo-uni.edu.ng",
      "+2348000000003",
    );
    await assignRole(parentAccount, "parent", "tenant");

    await client.query(
      `INSERT INTO relationship
         (id, tenant_id, from_person_id, to_person_id, type, academic_scope, financial_scope, consent_state)
       SELECT $1, $2, $3, $4, 'parent', true, true, 'granted'
       WHERE NOT EXISTS (
         SELECT 1 FROM relationship
         WHERE tenant_id = $2 AND from_person_id = $3 AND to_person_id = $4 AND type = 'parent'
       )`,
      [newId(), tenantId, parentPerson, studentPerson],
    );
  });

  console.log(`✔ seed complete — demo tenant ${tenantId} (short_name: ${DEMO_TENANT_SHORT})`);
  await closePool();
}

run().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
