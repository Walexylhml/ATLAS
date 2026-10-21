import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { withTenant } from "../database/rls.js";
import {
  academicSemester,
  academicSession,
  degreeClass,
  department,
  faculty,
  gradeBand,
  gradingScheme,
  programme,
  school,
} from "../database/schema/index.js";

/**
 * Reads and configures the academic structure (school → faculty → department →
 * programme), the calendar and the grading scheme. All tenant-scoped; writes are
 * gated upstream by the authorization guard (academic.manage).
 */
@Injectable()
export class AcademicService {
  // --- structure: read ---

  listSchools(tenantId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(school)
        .where(and(eq(school.tenantId, tenantId), isNull(school.deletedAt)))
        .orderBy(asc(school.code)),
    );
  }

  listFaculties(tenantId: string, schoolId?: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(faculty)
        .where(
          and(
            eq(faculty.tenantId, tenantId),
            isNull(faculty.deletedAt),
            schoolId ? eq(faculty.schoolId, schoolId) : undefined,
          ),
        )
        .orderBy(asc(faculty.code)),
    );
  }

  listDepartments(tenantId: string, facultyId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(department)
        .where(
          and(
            eq(department.tenantId, tenantId),
            eq(department.facultyId, facultyId),
            isNull(department.deletedAt),
          ),
        )
        .orderBy(asc(department.code)),
    );
  }

  listProgrammes(tenantId: string, departmentId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(programme)
        .where(
          and(
            eq(programme.tenantId, tenantId),
            eq(programme.departmentId, departmentId),
            isNull(programme.deletedAt),
          ),
        )
        .orderBy(asc(programme.code)),
    );
  }

  async getProgramme(tenantId: string, programmeId: string) {
    const [row] = await withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(programme)
        .where(
          and(
            eq(programme.tenantId, tenantId),
            eq(programme.id, programmeId),
            isNull(programme.deletedAt),
          ),
        )
        .limit(1),
    );
    if (!row) throw new NotFoundException("Programme not found");
    return row;
  }

  // --- structure: create ---

  async createSchool(tenantId: string, actorId: string, input: { code: string; name: string }) {
    const [row] = await withTenant({ tenantId, actorId }, (db) =>
      db
        .insert(school)
        .values({ id: newId(), tenantId, code: input.code, name: input.name, createdBy: actorId })
        .returning(),
    );
    return row;
  }

  async createFaculty(
    tenantId: string,
    actorId: string,
    input: { schoolId?: string; code: string; name: string },
  ) {
    if (input.schoolId) {
      const [s] = await withTenant({ tenantId }, (db) =>
        db
          .select({ id: school.id })
          .from(school)
          .where(and(eq(school.tenantId, tenantId), eq(school.id, input.schoolId!)))
          .limit(1),
      );
      if (!s) throw new NotFoundException("School not found");
    }
    const [row] = await withTenant({ tenantId, actorId }, (db) =>
      db
        .insert(faculty)
        .values({
          id: newId(),
          tenantId,
          schoolId: input.schoolId ?? null,
          code: input.code,
          name: input.name,
          createdBy: actorId,
        })
        .returning(),
    );
    return row;
  }

  async createDepartment(
    tenantId: string,
    actorId: string,
    facultyId: string,
    input: { code: string; name: string },
  ) {
    const [f] = await withTenant({ tenantId }, (db) =>
      db
        .select({ id: faculty.id })
        .from(faculty)
        .where(and(eq(faculty.tenantId, tenantId), eq(faculty.id, facultyId)))
        .limit(1),
    );
    if (!f) throw new NotFoundException("Faculty not found");
    const [row] = await withTenant({ tenantId, actorId }, (db) =>
      db
        .insert(department)
        .values({ id: newId(), tenantId, facultyId, code: input.code, name: input.name, createdBy: actorId })
        .returning(),
    );
    return row;
  }

  async createProgramme(
    tenantId: string,
    actorId: string,
    departmentId: string,
    input: { code: string; name: string; award: string; durationYears: number; maxLevel: number },
  ) {
    const [d] = await withTenant({ tenantId }, (db) =>
      db
        .select({ id: department.id })
        .from(department)
        .where(and(eq(department.tenantId, tenantId), eq(department.id, departmentId)))
        .limit(1),
    );
    if (!d) throw new NotFoundException("Department not found");
    const [row] = await withTenant({ tenantId, actorId }, (db) =>
      db
        .insert(programme)
        .values({
          id: newId(),
          tenantId,
          departmentId,
          code: input.code,
          name: input.name,
          award: input.award,
          durationYears: input.durationYears,
          maxLevel: input.maxLevel,
          createdBy: actorId,
        })
        .returning(),
    );
    return row;
  }

  // --- calendar & grading ---

  async currentCalendar(tenantId: string) {
    return withTenant({ tenantId }, async (db) => {
      const [session] = await db
        .select()
        .from(academicSession)
        .where(and(eq(academicSession.tenantId, tenantId), eq(academicSession.isCurrent, true)))
        .limit(1);
      const [semester] = session
        ? await db
            .select()
            .from(academicSemester)
            .where(
              and(
                eq(academicSemester.tenantId, tenantId),
                eq(academicSemester.sessionId, session.id),
                eq(academicSemester.isCurrent, true),
              ),
            )
            .limit(1)
        : [];
      return { session: session ?? null, semester: semester ?? null };
    });
  }

  async defaultGrading(tenantId: string) {
    return withTenant({ tenantId }, async (db) => {
      const [scheme] = await db
        .select()
        .from(gradingScheme)
        .where(and(eq(gradingScheme.tenantId, tenantId), eq(gradingScheme.isDefault, true)))
        .limit(1);
      if (!scheme) return { scheme: null, bands: [], classes: [] };
      const bands = await db
        .select()
        .from(gradeBand)
        .where(eq(gradeBand.schemeId, scheme.id))
        .orderBy(asc(gradeBand.minScore));
      const classes = await db
        .select()
        .from(degreeClass)
        .where(eq(degreeClass.schemeId, scheme.id))
        .orderBy(asc(degreeClass.rank));
      return { scheme, bands, classes };
    });
  }
}
