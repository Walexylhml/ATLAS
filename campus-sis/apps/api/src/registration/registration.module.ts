import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { newId } from "../common/ids.js";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { withTenant } from "../database/rls.js";
import {
  academicSession,
  course,
  courseOffering,
  courseRegistration,
  student,
} from "../database/schema/index.js";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";

const CreateOfferingSchema = z.object({
  sessionId: z.string().uuid().optional(),
  semester: z.enum(["first", "second"]).optional(),
  capacity: z.coerce.number().int().positive().optional(),
  lecturerPersonId: z.string().uuid().optional(),
});
const RegisterSchema = z.object({ offeringId: z.string().uuid() });

@Injectable()
export class OfferingsService {
  /** Create an offering of a course for a session+semester (defaults: current session, the course's semester). */
  async create(
    tenantId: string,
    actorId: string,
    courseId: string,
    input: z.infer<typeof CreateOfferingSchema>,
  ) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [c] = await db
        .select({ id: course.id, semester: course.semester })
        .from(course)
        .where(and(eq(course.tenantId, tenantId), eq(course.id, courseId), isNull(course.deletedAt)))
        .limit(1);
      if (!c) throw new NotFoundException("Course not found");

      let sessionId = input.sessionId;
      if (!sessionId) {
        const [s] = await db
          .select({ id: academicSession.id })
          .from(academicSession)
          .where(and(eq(academicSession.tenantId, tenantId), eq(academicSession.isCurrent, true)))
          .limit(1);
        if (!s) throw new BadRequestException("No current session; pass sessionId");
        sessionId = s.id;
      }

      const [row] = await db
        .insert(courseOffering)
        .values({
          id: newId(),
          tenantId,
          courseId,
          sessionId,
          semester: input.semester ?? c.semester,
          capacity: input.capacity ?? null,
          lecturerPersonId: input.lecturerPersonId ?? null,
          createdBy: actorId,
        })
        .returning();
      return row;
    });
  }

  listBySession(tenantId: string, sessionId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select({
          id: courseOffering.id,
          status: courseOffering.status,
          semester: courseOffering.semester,
          courseCode: course.code,
          courseTitle: course.title,
          creditUnits: course.creditUnits,
        })
        .from(courseOffering)
        .innerJoin(course, eq(course.id, courseOffering.courseId))
        .where(
          and(
            eq(courseOffering.tenantId, tenantId),
            eq(courseOffering.sessionId, sessionId),
            isNull(courseOffering.deletedAt),
          ),
        )
        .orderBy(asc(course.code)),
    );
  }

  listByCourse(tenantId: string, courseId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(courseOffering)
        .where(
          and(
            eq(courseOffering.tenantId, tenantId),
            eq(courseOffering.courseId, courseId),
            isNull(courseOffering.deletedAt),
          ),
        ),
    );
  }
}

@Injectable()
export class RegistrationService {
  /** Register a student for an offering. Validates the student is active and the offering open; rejects duplicates. */
  async register(tenantId: string, actorId: string, studentId: string, offeringId: string) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [stu] = await db
        .select({ id: student.id, status: student.status })
        .from(student)
        .where(and(eq(student.tenantId, tenantId), eq(student.id, studentId), isNull(student.deletedAt)))
        .limit(1);
      if (!stu) throw new NotFoundException("Student not found");
      if (stu.status !== "active") throw new BadRequestException("Student is not active");

      const [off] = await db
        .select({ id: courseOffering.id, status: courseOffering.status })
        .from(courseOffering)
        .where(
          and(
            eq(courseOffering.tenantId, tenantId),
            eq(courseOffering.id, offeringId),
            isNull(courseOffering.deletedAt),
          ),
        )
        .limit(1);
      if (!off) throw new NotFoundException("Offering not found");
      if (off.status !== "open") throw new BadRequestException("Offering is not open for registration");

      const [existing] = await db
        .select({ id: courseRegistration.id })
        .from(courseRegistration)
        .where(
          and(
            eq(courseRegistration.tenantId, tenantId),
            eq(courseRegistration.studentId, studentId),
            eq(courseRegistration.offeringId, offeringId),
          ),
        )
        .limit(1);
      if (existing) throw new ConflictException("Already registered for this offering");

      const [row] = await db
        .insert(courseRegistration)
        .values({ id: newId(), tenantId, studentId, offeringId, createdBy: actorId })
        .returning();
      return row;
    });
  }

  listByStudent(tenantId: string, studentId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select({
          id: courseRegistration.id,
          status: courseRegistration.status,
          registeredAt: courseRegistration.registeredAt,
          offeringId: courseOffering.id,
          courseCode: course.code,
          courseTitle: course.title,
          creditUnits: course.creditUnits,
        })
        .from(courseRegistration)
        .innerJoin(courseOffering, eq(courseOffering.id, courseRegistration.offeringId))
        .innerJoin(course, eq(course.id, courseOffering.courseId))
        .where(
          and(eq(courseRegistration.tenantId, tenantId), eq(courseRegistration.studentId, studentId)),
        )
        .orderBy(desc(courseRegistration.registeredAt)),
    );
  }

  async drop(tenantId: string, actorId: string, studentId: string, registrationId: string) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [reg] = await db
        .select({ id: courseRegistration.id, status: courseRegistration.status })
        .from(courseRegistration)
        .where(
          and(
            eq(courseRegistration.tenantId, tenantId),
            eq(courseRegistration.id, registrationId),
            eq(courseRegistration.studentId, studentId),
          ),
        )
        .limit(1);
      if (!reg) throw new NotFoundException("Registration not found");
      if (reg.status === "dropped") throw new BadRequestException("Already dropped");

      const [row] = await db
        .update(courseRegistration)
        .set({ status: "dropped", droppedAt: new Date(), updatedAt: new Date(), updatedBy: actorId })
        .where(eq(courseRegistration.id, registrationId))
        .returning();
      return row;
    });
  }
}

/**
 * Course offerings — a course run in a session. Creating one is scope-gated by
 * the course's department (HOD/Dean/registrar); listing is reference-readable.
 */
@Controller()
export class OfferingsController {
  constructor(private readonly offerings: OfferingsService) {}

  @Post("academic/courses/:courseId/offerings")
  @RequirePermission({ permission: PERMISSIONS.OFFERING_MANAGE, courseIdParam: "courseId" })
  create(
    @CurrentPrincipal() p: Principal,
    @Param("courseId") courseId: string,
    @Body(new ZodValidationPipe(CreateOfferingSchema)) body: z.infer<typeof CreateOfferingSchema>,
  ) {
    return this.offerings.create(p.tenantId, p.accountId, courseId, body);
  }

  @Get("academic/sessions/:sessionId/offerings")
  @RequirePermission(PERMISSIONS.COURSE_READ)
  listBySession(@CurrentPrincipal() p: Principal, @Param("sessionId") sessionId: string) {
    return this.offerings.listBySession(p.tenantId, sessionId);
  }

  @Get("academic/courses/:courseId/offerings")
  @RequirePermission({ permission: PERMISSIONS.COURSE_READ, courseIdParam: "courseId" })
  listByCourse(@CurrentPrincipal() p: Principal, @Param("courseId") courseId: string) {
    return this.offerings.listByCourse(p.tenantId, courseId);
  }
}

/**
 * Registration — a student enrols in an offering. A student self-registers
 * (self scope); staff register/manage on behalf, scope-gated through the
 * student's programme placement.
 */
@Controller()
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post("students/:studentId/registrations")
  @RequirePermission({ permission: PERMISSIONS.REGISTRATION_REGISTER, studentIdParam: "studentId" })
  register(
    @CurrentPrincipal() p: Principal,
    @Param("studentId") studentId: string,
    @Body(new ZodValidationPipe(RegisterSchema)) body: z.infer<typeof RegisterSchema>,
  ) {
    return this.registration.register(p.tenantId, p.accountId, studentId, body.offeringId);
  }

  @Get("students/:studentId/registrations")
  @RequirePermission({ permission: PERMISSIONS.REGISTRATION_READ, studentIdParam: "studentId" })
  list(@CurrentPrincipal() p: Principal, @Param("studentId") studentId: string) {
    return this.registration.listByStudent(p.tenantId, studentId);
  }

  @Post("students/:studentId/registrations/:registrationId/drop")
  @HttpCode(200)
  @RequirePermission({ permission: PERMISSIONS.REGISTRATION_REGISTER, studentIdParam: "studentId" })
  drop(
    @CurrentPrincipal() p: Principal,
    @Param("studentId") studentId: string,
    @Param("registrationId") registrationId: string,
  ) {
    return this.registration.drop(p.tenantId, p.accountId, studentId, registrationId);
  }
}

@Module({
  controllers: [OfferingsController, RegistrationController],
  providers: [OfferingsService, RegistrationService],
  exports: [OfferingsService, RegistrationService],
})
export class RegistrationModule {}
