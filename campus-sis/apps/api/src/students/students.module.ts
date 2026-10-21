import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { newId } from "../common/ids.js";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { withTenant } from "../database/rls.js";
import { person, programme, student } from "../database/schema/index.js";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";

const EnrolStudentSchema = z.object({
  personId: z.string().uuid(),
  matricNo: z.string().min(1).max(32).optional(),
  currentLevel: z.coerce.number().int().min(100).max(900).default(100),
  entrySessionId: z.string().uuid().optional(),
});

@Injectable()
export class StudentsService {
  async enrol(
    tenantId: string,
    actorId: string,
    programmeId: string,
    input: z.infer<typeof EnrolStudentSchema>,
  ) {
    await withTenant({ tenantId }, async (db) => {
      const [prog] = await db
        .select({ id: programme.id })
        .from(programme)
        .where(and(eq(programme.tenantId, tenantId), eq(programme.id, programmeId), isNull(programme.deletedAt)))
        .limit(1);
      if (!prog) throw new NotFoundException("Programme not found");
      const [per] = await db
        .select({ id: person.id })
        .from(person)
        .where(and(eq(person.tenantId, tenantId), eq(person.id, input.personId), isNull(person.deletedAt)))
        .limit(1);
      if (!per) throw new NotFoundException("Person not found");
    });
    const [row] = await withTenant({ tenantId, actorId }, (db) =>
      db
        .insert(student)
        .values({
          id: newId(),
          tenantId,
          personId: input.personId,
          programmeId,
          matricNo: input.matricNo ?? null,
          currentLevel: input.currentLevel,
          entrySessionId: input.entrySessionId ?? null,
          createdBy: actorId,
        })
        .returning(),
    );
    return row;
  }

  listByProgramme(tenantId: string, programmeId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(student)
        .where(
          and(
            eq(student.tenantId, tenantId),
            eq(student.programmeId, programmeId),
            isNull(student.deletedAt),
          ),
        )
        .orderBy(asc(student.matricNo)),
    );
  }

  async get(tenantId: string, studentId: string) {
    const [row] = await withTenant({ tenantId }, (db) =>
      db
        .select({
          id: student.id,
          matricNo: student.matricNo,
          programmeId: student.programmeId,
          currentLevel: student.currentLevel,
          status: student.status,
          surname: person.surname,
          firstName: person.firstName,
        })
        .from(student)
        .innerJoin(person, eq(person.id, student.personId))
        .where(
          and(eq(student.tenantId, tenantId), eq(student.id, studentId), isNull(student.deletedAt)),
        )
        .limit(1),
    );
    if (!row) throw new NotFoundException("Student not found");
    return row;
  }
}

/**
 * Student records. Enrolling and reading are scope-gated: a HOD sees/manages
 * students in their department's programmes, a Dean across the faculty — resolved
 * because a student's programme places them in the hierarchy (see AuthzService).
 */
@Controller()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post("academic/programmes/:programmeId/students")
  @RequirePermission({ permission: PERMISSIONS.STUDENT_MANAGE, programmeIdParam: "programmeId" })
  enrol(
    @CurrentPrincipal() p: Principal,
    @Param("programmeId") programmeId: string,
    @Body(new ZodValidationPipe(EnrolStudentSchema)) body: z.infer<typeof EnrolStudentSchema>,
  ) {
    return this.students.enrol(p.tenantId, p.accountId, programmeId, body);
  }

  @Get("academic/programmes/:programmeId/students")
  @RequirePermission({ permission: PERMISSIONS.STUDENT_READ, programmeIdParam: "programmeId" })
  listByProgramme(@CurrentPrincipal() p: Principal, @Param("programmeId") programmeId: string) {
    return this.students.listByProgramme(p.tenantId, programmeId);
  }

  @Get("students/:studentId")
  @RequirePermission({ permission: PERMISSIONS.STUDENT_READ, studentIdParam: "studentId" })
  get(@CurrentPrincipal() p: Principal, @Param("studentId") studentId: string) {
    return this.students.get(p.tenantId, studentId);
  }
}

@Module({ controllers: [StudentsController], providers: [StudentsService], exports: [StudentsService] })
export class StudentsModule {}
