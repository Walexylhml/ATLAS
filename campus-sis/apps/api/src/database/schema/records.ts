import { integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, softDelete, tenantColumn } from "./_shared.js";
import { courseTypeEnum, semesterOrdinalEnum, studentStatusEnum } from "./enums.js";
import { academicSession, department, programme } from "./academic.js";
import { person } from "./identity.js";

/**
 * ACADEMIC RECORDS (Phase 1 foundation): the student record and the course
 * catalogue. A `student` is a `person` enrolled on a `programme` — which places
 * them in a department → faculty → school, so authorization scope finally
 * resolves for person targets (see AuthzService). A `course` is a department-
 * owned catalogue item; the specific run of a course in a session/semester
 * (the offering) and registration land in the next slice.
 */

export const student = pgTable(
  "student",
  {
    ...idColumn,
    ...tenantColumn,
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    // Matriculation number — issued at matriculation, unique within the tenant.
    // Nullable until matriculated (an admitted-but-not-yet-matriculated student).
    matricNo: text("matric_no"),
    programmeId: uuid("programme_id")
      .notNull()
      .references(() => programme.id),
    // 100–500 (×100 per year of study).
    currentLevel: integer("current_level").notNull().default(100),
    entrySessionId: uuid("entry_session_id").references(() => academicSession.id),
    status: studentStatusEnum("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [
    // One student record per person per tenant.
    unique("uq_student_tenant_person").on(t.tenantId, t.personId),
    unique("uq_student_tenant_matric").on(t.tenantId, t.matricNo),
  ],
);

export const course = pgTable(
  "course",
  {
    ...idColumn,
    ...tenantColumn,
    departmentId: uuid("department_id")
      .notNull()
      .references(() => department.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    creditUnits: integer("credit_units").notNull().default(3),
    // The level the course is normally taken at, and the semester it runs in.
    level: integer("level").notNull().default(100),
    semester: semesterOrdinalEnum("semester").notNull(),
    type: courseTypeEnum("type").notNull().default("core"),
    status: text("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [unique("uq_course_tenant_code").on(t.tenantId, t.code)],
);
