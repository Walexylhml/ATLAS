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
      // Baseline every account holds at tenant scope — tenant-wide reference reads.
      ["member", "Member (baseline)"],
      ["institution_admin", "Institution Administrator"],
      ["registrar", "Registrar"],
      ["bursar", "Bursar / Finance"],
      ["provost", "Provost / Dean of School"],
      ["dean", "Dean of Faculty"],
      ["hod", "Head of Department"],
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
      ["academic.read", "academic", "read", null],
      ["academic.manage", "academic", "manage", null],
      ["student.read", "student", "read", null],
      ["student.manage", "student", "manage", null],
      ["course.read", "course", "read", null],
      ["course.manage", "course", "manage", null],
      ["offering.manage", "offering", "manage", null],
      ["registration.register", "registration", "register", null],
      ["registration.read", "registration", "read", null],
      ["finance.read", "finance", "read", null],
      ["finance.manage", "finance", "manage", null],
      ["payment.initiate", "payment", "initiate", null],
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
      // Reading academic structure/grading and the course catalogue is tenant-wide
      // reference data; student records are PII and stay scope-gated.
      ["member", ["academic.read", "course.read"]],
      [
        "institution_admin",
        [
          "tenant.configure",
          "person.read",
          "person.write",
          "account.manage",
          "role.assign",
          "audit.read",
          "academic.manage",
          "student.read",
          "student.manage",
          "course.manage",
          "offering.manage",
          "registration.register",
          "registration.read",
          "finance.read",
          "finance.manage",
        ],
      ],
      [
        "registrar",
        ["person.read", "person.write", "audit.read", "academic.manage", "student.read", "student.manage", "course.manage", "offering.manage", "registration.register", "registration.read", "finance.read", "finance.manage"],
      ],
      // Bursar / finance owns the money.
      ["bursar", ["person.read", "student.read", "finance.read", "finance.manage"]],
      // Manage is scope-gated: provost over a school, dean over a faculty, HOD over a department.
      ["provost", ["person.read", "academic.manage", "student.read", "student.manage", "course.manage", "offering.manage", "registration.register", "registration.read", "finance.read"]],
      ["dean", ["person.read", "academic.manage", "student.read", "student.manage", "course.manage", "offering.manage", "registration.register", "registration.read", "finance.read"]],
      ["hod", ["person.read", "academic.manage", "student.read", "student.manage", "course.manage", "offering.manage", "registration.register", "registration.read", "finance.read"]],
      ["lecturer", ["person.read"]],
      // A student reads their own record, self-registers, and reads/pays their own fees (self scope).
      ["student", ["person.read", "student.read", "registration.register", "registration.read", "finance.read", "payment.initiate"]],
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
      scopeType: "tenant" | "school" | "faculty" | "department" | "self",
      scopeRefId: string | null = null,
    ): Promise<void> => {
      const roleRow = await client.query<{ id: string }>(
        `SELECT id FROM role WHERE key = $1 AND tenant_id IS NULL`,
        [roleKey],
      );
      const roleId = roleRow.rows[0]?.id;
      if (!roleId) return;
      await client.query(
        `INSERT INTO role_assignment (id, tenant_id, user_account_id, role_id, scope_type, scope_ref_id, status)
         SELECT $1, $2, $3, $4, $5, $6, 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM role_assignment
           WHERE tenant_id = $2 AND user_account_id = $3 AND role_id = $4
             AND scope_type = $5 AND scope_ref_id IS NOT DISTINCT FROM $6
         )`,
        [newId(), tenantId, accountId, roleId, scopeType, scopeRefId],
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
    await assignRole(adminAccount, "member", "tenant");

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
    await assignRole(studentAccount, "member", "tenant");

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
    await assignRole(parentAccount, "member", "tenant");

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

    // --- Academic structure: School → Faculty → Department → Programme ---
    const one = async (text: string, params: unknown[]): Promise<string> =>
      (await client.query<{ id: string }>(text, params)).rows[0]!.id;

    const upsertSchool = (code: string, name: string) =>
      one(
        `INSERT INTO school (id, tenant_id, code, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [newId(), tenantId, code, name],
      );
    const upsertFaculty = (schoolId: string | null, code: string, name: string) =>
      one(
        `INSERT INTO faculty (id, tenant_id, school_id, code, name) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, school_id = EXCLUDED.school_id RETURNING id`,
        [newId(), tenantId, schoolId, code, name],
      );
    const upsertDept = (facultyId: string, code: string, name: string) =>
      one(
        `INSERT INTO department (id, tenant_id, faculty_id, code, name) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, faculty_id = EXCLUDED.faculty_id RETURNING id`,
        [newId(), tenantId, facultyId, code, name],
      );
    const upsertProg = (
      deptId: string,
      code: string,
      name: string,
      award: string,
      years: number,
      maxLevel: number,
    ) =>
      one(
        `INSERT INTO programme (id, tenant_id, department_id, code, name, award, duration_years, max_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [newId(), tenantId, deptId, code, name, award, years, maxLevel],
      );

    const cns = await upsertSchool("CNS", "College of Natural Sciences");
    const coe = await upsertSchool("COE", "College of Engineering");
    const phs = await upsertFaculty(cns, "PHS", "Faculty of Physical Sciences");
    const feng = await upsertFaculty(coe, "ENG", "Faculty of Engineering");
    const csc = await upsertDept(phs, "CSC", "Department of Computer Science");
    const mth = await upsertDept(phs, "MTH", "Department of Mathematics");
    const eee = await upsertDept(feng, "EEE", "Department of Electrical & Electronic Engineering");
    const cscProg = await upsertProg(csc, "CSC-BSC", "B.Sc. Computer Science", "B.Sc.", 4, 400);
    await upsertProg(mth, "MTH-BSC", "B.Sc. Mathematics", "B.Sc.", 4, 400);
    await upsertProg(eee, "EEE-BENG", "B.Eng. Electrical Engineering", "B.Eng.", 5, 500);

    // Dean (faculty scope) and HOD (department scope) — demonstrate scope containment.
    const deanPerson = await ensurePerson(
      "dean.science@demo-uni.edu.ng",
      "Balogun",
      "Tunde",
      "+2348000000004",
    );
    const deanAccount = await ensureAccount(
      deanPerson,
      "demo.dean",
      "dean.science@demo-uni.edu.ng",
      "+2348000000004",
    );
    await assignRole(deanAccount, "dean", "faculty", phs);
    await assignRole(deanAccount, "member", "tenant");
    await client.query(`UPDATE faculty SET dean_person_id = $1 WHERE id = $2 AND tenant_id = $3`, [
      deanPerson,
      phs,
      tenantId,
    ]);

    const hodPerson = await ensurePerson("hod.csc@demo-uni.edu.ng", "Eze", "Amaka", "+2348000000005");
    const hodAccount = await ensureAccount(
      hodPerson,
      "demo.hod",
      "hod.csc@demo-uni.edu.ng",
      "+2348000000005",
    );
    await assignRole(hodAccount, "hod", "department", csc);
    await assignRole(hodAccount, "member", "tenant");
    await client.query(`UPDATE department SET hod_person_id = $1 WHERE id = $2 AND tenant_id = $3`, [
      hodPerson,
      csc,
      tenantId,
    ]);

    // --- Academic calendar: 2025/2026 session, two semesters ---
    const session = await one(
      `INSERT INTO academic_session (id, tenant_id, name, is_current) VALUES ($1, $2, '2025/2026', true)
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_current = true RETURNING id`,
      [newId(), tenantId],
    );
    for (const [ordinal, name, current] of [
      ["first", "First Semester", true],
      ["second", "Second Semester", false],
    ] as const) {
      await client.query(
        `INSERT INTO academic_semester (id, tenant_id, session_id, ordinal, name, is_current)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (session_id, ordinal) DO UPDATE SET name = EXCLUDED.name`,
        [newId(), tenantId, session, ordinal, name, current],
      );
    }

    // --- Grading scheme: classic Nigerian 5-point (default) ---
    const scheme = await one(
      `INSERT INTO grading_scheme (id, tenant_id, name, is_default, scale_max, pass_mark)
       VALUES ($1, $2, 'Nigerian 5-Point', true, 5.00, 40)
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_default = true RETURNING id`,
      [newId(), tenantId],
    );
    const bands: Array<[string, number, number, string, boolean]> = [
      ["A", 70, 100, "5.00", true],
      ["B", 60, 69, "4.00", true],
      ["C", 50, 59, "3.00", true],
      ["D", 45, 49, "2.00", true],
      ["E", 40, 44, "1.00", true],
      ["F", 0, 39, "0.00", false],
    ];
    for (const [grade, min, max, point, pass] of bands) {
      await client.query(
        `INSERT INTO grade_band (id, tenant_id, scheme_id, grade, min_score, max_score, grade_point, is_pass)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (scheme_id, grade)
         DO UPDATE SET min_score = EXCLUDED.min_score, max_score = EXCLUDED.max_score,
                       grade_point = EXCLUDED.grade_point, is_pass = EXCLUDED.is_pass`,
        [newId(), tenantId, scheme, grade, min, max, point, pass],
      );
    }
    const classes: Array<[string, string, string, number]> = [
      ["First Class", "4.50", "5.00", 1],
      ["Second Class Upper (2:1)", "3.50", "4.49", 2],
      ["Second Class Lower (2:2)", "2.40", "3.49", 3],
      ["Third Class", "1.50", "2.39", 4],
      ["Pass", "1.00", "1.49", 5],
    ];
    for (const [name, min, max, rank] of classes) {
      await client.query(
        `INSERT INTO degree_class (id, tenant_id, scheme_id, name, min_cgpa, max_cgpa, rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (scheme_id, name)
         DO UPDATE SET min_cgpa = EXCLUDED.min_cgpa, max_cgpa = EXCLUDED.max_cgpa, rank = EXCLUDED.rank`,
        [newId(), tenantId, scheme, name, min, max, rank],
      );
    }

    // --- Tenant configuration (configure, don't code) ---
    const configs: Array<[string, string, string]> = [
      ["academic", "ca_exam_weighting", JSON.stringify({ ca: 40, exam: 60 })],
      ["academic", "school_level_label", JSON.stringify("College")],
    ];
    for (const [ns, key, value] of configs) {
      await client.query(
        `INSERT INTO config (id, tenant_id, namespace, key, value)
         SELECT $1, $2, $3, $4, $5::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM config WHERE tenant_id = $2 AND namespace = $3 AND key = $4 AND effective_to IS NULL
         )`,
        [newId(), tenantId, ns, key, value],
      );
    }

    // --- Student record: enrol the demo student into B.Sc. Computer Science ---
    await client.query(
      `INSERT INTO student (id, tenant_id, person_id, matric_no, programme_id, current_level, entry_session_id)
       SELECT $1, $2, $3, 'CSC/2025/001', $4, 100, $5
       WHERE NOT EXISTS (SELECT 1 FROM student WHERE tenant_id = $2 AND person_id = $3)`,
      [newId(), tenantId, studentPerson, cscProg, session],
    );
    const studentRow = await client.query<{ id: string }>(
      `SELECT id FROM student WHERE tenant_id = $1 AND person_id = $2`,
      [tenantId, studentPerson],
    );
    const demoStudentId = studentRow.rows[0]?.id;

    // --- Course catalogue: a few CSC/MTH courses ---
    const courses: Array<[string, string, string, number, number, string, string]> = [
      [csc, "CSC101", "Introduction to Computer Science", 3, 100, "first", "core"],
      [csc, "CSC102", "Introduction to Programming", 3, 100, "second", "core"],
      [mth, "MTH101", "Elementary Mathematics I", 3, 100, "first", "core"],
    ];
    const courseIds: Record<string, string> = {};
    for (const [dept, code, title, units, level, sem, type] of courses) {
      const r = await one(
        `INSERT INTO course (id, tenant_id, department_id, code, title, credit_units, level, semester, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, code) DO UPDATE SET title = EXCLUDED.title RETURNING id`,
        [newId(), tenantId, dept, code, title, units, level, sem, type],
      );
      courseIds[code] = r;
    }

    // --- Course offerings for the current session + a demo registration ---
    const offeringIds: Record<string, string> = {};
    for (const [, code, , , , sem] of courses) {
      offeringIds[code] = await one(
        `INSERT INTO course_offering (id, tenant_id, course_id, session_id, semester, status)
         VALUES ($1, $2, $3, $4, $5, 'open')
         ON CONFLICT (course_id, session_id, semester) DO UPDATE SET status = 'open' RETURNING id`,
        [newId(), tenantId, courseIds[code], session, sem],
      );
    }
    if (demoStudentId) {
      await client.query(
        `INSERT INTO course_registration (id, tenant_id, student_id, offering_id)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM course_registration WHERE tenant_id = $2 AND student_id = $3 AND offering_id = $4
         )`,
        [newId(), tenantId, demoStudentId, offeringIds["CSC101"]],
      );
    }

    // --- Student financials: a fee structure + an issued invoice (amounts in kobo) ---
    const feeStructureId = await one(
      `INSERT INTO fee_structure (id, tenant_id, name, session_id, programme_id, level, currency)
       VALUES ($1, $2, '100 Level Fees 2025/2026', $3, $4, 100, 'NGN')
       ON CONFLICT (tenant_id, name) DO UPDATE SET session_id = EXCLUDED.session_id RETURNING id`,
      [newId(), tenantId, session, cscProg],
    );
    const feeItems: Array<[string, number]> = [
      ["Tuition", 10_000_000], // ₦100,000
      ["Acceptance Fee", 5_000_000], // ₦50,000
      ["ICT Levy", 200_000], // ₦2,000
    ];
    const itemCount = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM fee_item WHERE fee_structure_id = $1`,
      [feeStructureId],
    );
    if ((itemCount.rows[0]?.n ?? 0) === 0) {
      for (const [name, amt] of feeItems) {
        await client.query(
          `INSERT INTO fee_item (id, tenant_id, fee_structure_id, name, amount_minor) VALUES ($1, $2, $3, $4, $5)`,
          [newId(), tenantId, feeStructureId, name, amt],
        );
      }
    }
    if (demoStudentId) {
      const total = feeItems.reduce((s, [, a]) => s + a, 0);
      const existingInv = await client.query(
        `SELECT id FROM invoice WHERE tenant_id = $1 AND student_id = $2 AND fee_structure_id = $3 AND status <> 'void'`,
        [tenantId, demoStudentId, feeStructureId],
      );
      if (existingInv.rows.length === 0) {
        const invId = await one(
          `INSERT INTO invoice (id, tenant_id, student_id, session_id, fee_structure_id, status, currency, total_minor, balance_minor, issued_at)
           VALUES ($1, $2, $3, $4, $5, 'issued', 'NGN', $6, $6, now()) RETURNING id`,
          [newId(), tenantId, demoStudentId, session, feeStructureId, total],
        );
        for (const [name, amt] of feeItems) {
          await client.query(
            `INSERT INTO invoice_line (id, tenant_id, invoice_id, description, amount_minor) VALUES ($1, $2, $3, $4, $5)`,
            [newId(), tenantId, invId, name, amt],
          );
        }
        await client.query(
          `INSERT INTO ledger_entry (id, tenant_id, student_id, invoice_id, type, amount_minor, currency, memo, reference)
           VALUES ($1, $2, $3, $4, 'charge', $5, 'NGN', $6, $7)`,
          [newId(), tenantId, demoStudentId, invId, total, "100 Level Fees 2025/2026", invId],
        );
      }
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
