import { integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, softDelete, tenantColumn } from "./_shared.js";
import { offeringStatusEnum, registrationStatusEnum, semesterOrdinalEnum } from "./enums.js";
import { academicSession } from "./academic.js";
import { course } from "./records.js";
import { student } from "./records.js";

/**
 * COURSE REGISTRATION (Phase 1). A `course_offering` is a specific run of a
 * course in a session + semester — the thing students actually register for and
 * (later) earn scores in. A `course_registration` links a student to an offering.
 * Keeping scores on the offering (a run), not the course, is what makes carryover
 * and re-sits attributable to the right session. Both tenant-owned, under RLS.
 */

export const courseOffering = pgTable(
  "course_offering",
  {
    ...idColumn,
    ...tenantColumn,
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => academicSession.id),
    semester: semesterOrdinalEnum("semester").notNull(),
    status: offeringStatusEnum("status").notNull().default("open"),
    // Optional cap on registrations; null = uncapped.
    capacity: integer("capacity"),
    // The lecturer assigned to teach this run (score-entry authority in Phase 2).
    lecturerPersonId: uuid("lecturer_person_id"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [
    // One offering per course per session + semester.
    unique("uq_offering_course_session_semester").on(t.courseId, t.sessionId, t.semester),
  ],
);

export const courseRegistration = pgTable(
  "course_registration",
  {
    ...idColumn,
    ...tenantColumn,
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => courseOffering.id),
    status: registrationStatusEnum("status").notNull().default("registered"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    // A student registers an offering at most once.
    unique("uq_registration_student_offering").on(t.studentId, t.offeringId),
  ],
);
