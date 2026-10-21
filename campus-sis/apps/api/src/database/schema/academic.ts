import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, idColumn, softDelete, tenantColumn } from "./_shared.js";
import { semesterOrdinalEnum } from "./enums.js";

/**
 * ACADEMIC STRUCTURE — the classic Nigerian university shape:
 *   Faculty → Department → Programme, governed by a Dean (faculty) and HOD
 *   (department). This hierarchy is what the RBAC scope types resolve against:
 *   a `faculty`-scoped grant covers every department and programme beneath it.
 *
 * Also here: the academic calendar (session → semester) and a tenant-configurable
 * grading scheme (bands + degree classifications), so each institution runs its
 * own policy as data, not code.
 */

/**
 * Top grouping (what institutions call a School or College). Optional: a Faculty
 * may sit directly under the tenant when a tenant has no School level. The label
 * ("School"/"College"/custom) is tenant config; the scope ladder is fixed.
 */
export const school = pgTable(
  "school",
  {
    ...idColumn,
    ...tenantColumn,
    code: text("code").notNull(),
    name: text("name").notNull(),
    // Provost / Dean of School.
    headPersonId: uuid("head_person_id"),
    status: text("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [unique("uq_school_tenant_code").on(t.tenantId, t.code)],
);

export const faculty = pgTable(
  "faculty",
  {
    ...idColumn,
    ...tenantColumn,
    // Nullable: a Faculty may sit directly under the tenant when there is no
    // School level above it.
    schoolId: uuid("school_id").references(() => school.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    deanPersonId: uuid("dean_person_id"),
    status: text("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [unique("uq_faculty_tenant_code").on(t.tenantId, t.code)],
);

export const department = pgTable(
  "department",
  {
    ...idColumn,
    ...tenantColumn,
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculty.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    hodPersonId: uuid("hod_person_id"),
    status: text("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [unique("uq_department_tenant_code").on(t.tenantId, t.code)],
);

export const programme = pgTable(
  "programme",
  {
    ...idColumn,
    ...tenantColumn,
    departmentId: uuid("department_id")
      .notNull()
      .references(() => department.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // Degree/award title — kept as text so each tenant type can use its own
    // (B.Sc./B.Eng./LL.B for universities, HND for polytechnics, NCE for colleges).
    award: text("award").notNull(),
    durationYears: integer("duration_years").notNull().default(4),
    // Highest level in this programme (100-level steps): 400 for a 4-year B.Sc.,
    // 500 for a 5-year B.Eng. Derived default, overridable per programme.
    maxLevel: integer("max_level").notNull().default(400),
    status: text("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [unique("uq_programme_tenant_code").on(t.tenantId, t.code)],
);

/** An academic year, e.g. "2025/2026". One is flagged current per tenant. */
export const academicSession = pgTable(
  "academic_session",
  {
    ...idColumn,
    ...tenantColumn,
    name: text("name").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    isCurrent: boolean("is_current").notNull().default(false),
    status: text("status").notNull().default("active"),
    ...auditColumns,
  },
  (t) => [unique("uq_session_tenant_name").on(t.tenantId, t.name)],
);

/** A semester within a session. Nigerian schools run two; ordinal keeps order. */
export const academicSemester = pgTable(
  "academic_semester",
  {
    ...idColumn,
    ...tenantColumn,
    sessionId: uuid("session_id")
      .notNull()
      .references(() => academicSession.id),
    ordinal: semesterOrdinalEnum("ordinal").notNull(),
    name: text("name").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    isCurrent: boolean("is_current").notNull().default(false),
    ...auditColumns,
  },
  (t) => [unique("uq_semester_session_ordinal").on(t.sessionId, t.ordinal)],
);

/** A grading policy. Tenants configure their own; one is the default. */
export const gradingScheme = pgTable(
  "grading_scheme",
  {
    ...idColumn,
    ...tenantColumn,
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    // Max grade point on the scale — 5.00 for the classic Nigerian 5-point GPA.
    scaleMax: numeric("scale_max", { precision: 3, scale: 2 }).notNull().default("5.00"),
    // Lowest score that still passes a course.
    passMark: integer("pass_mark").notNull().default(40),
    status: text("status").notNull().default("active"),
    ...auditColumns,
  },
  (t) => [unique("uq_grading_scheme_tenant_name").on(t.tenantId, t.name)],
);

/** A letter grade band within a scheme: score range → grade point. */
export const gradeBand = pgTable(
  "grade_band",
  {
    ...idColumn,
    ...tenantColumn,
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => gradingScheme.id),
    grade: text("grade").notNull(),
    minScore: integer("min_score").notNull(),
    maxScore: integer("max_score").notNull(),
    gradePoint: numeric("grade_point", { precision: 3, scale: 2 }).notNull(),
    isPass: boolean("is_pass").notNull().default(true),
    ...auditColumns,
  },
  (t) => [unique("uq_grade_band_scheme_grade").on(t.schemeId, t.grade)],
);

/** Degree classification bands (First Class, 2:1, …) keyed to a CGPA range. */
export const degreeClass = pgTable(
  "degree_class",
  {
    ...idColumn,
    ...tenantColumn,
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => gradingScheme.id),
    name: text("name").notNull(),
    minCgpa: numeric("min_cgpa", { precision: 3, scale: 2 }).notNull(),
    maxCgpa: numeric("max_cgpa", { precision: 3, scale: 2 }).notNull(),
    // Ordering, best (1) to worst — stable sort independent of name.
    rank: integer("rank").notNull(),
    ...auditColumns,
  },
  (t) => [unique("uq_degree_class_scheme_name").on(t.schemeId, t.name)],
);
