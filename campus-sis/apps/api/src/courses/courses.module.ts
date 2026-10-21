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
import { course, department } from "../database/schema/index.js";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";

const CreateCourseSchema = z.object({
  code: z.string().min(1).max(32),
  title: z.string().min(1).max(200),
  creditUnits: z.coerce.number().int().min(0).max(12).default(3),
  level: z.coerce.number().int().min(100).max(900).default(100),
  semester: z.enum(["first", "second"]),
  type: z.enum(["core", "required", "elective", "general_studies"]).default("core"),
});

@Injectable()
export class CoursesService {
  async create(
    tenantId: string,
    actorId: string,
    departmentId: string,
    input: z.infer<typeof CreateCourseSchema>,
  ) {
    const [dept] = await withTenant({ tenantId }, (db) =>
      db
        .select({ id: department.id })
        .from(department)
        .where(and(eq(department.tenantId, tenantId), eq(department.id, departmentId), isNull(department.deletedAt)))
        .limit(1),
    );
    if (!dept) throw new NotFoundException("Department not found");
    const [row] = await withTenant({ tenantId, actorId }, (db) =>
      db
        .insert(course)
        .values({
          id: newId(),
          tenantId,
          departmentId,
          code: input.code,
          title: input.title,
          creditUnits: input.creditUnits,
          level: input.level,
          semester: input.semester,
          type: input.type,
          createdBy: actorId,
        })
        .returning(),
    );
    return row;
  }

  listByDepartment(tenantId: string, departmentId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(course)
        .where(
          and(
            eq(course.tenantId, tenantId),
            eq(course.departmentId, departmentId),
            isNull(course.deletedAt),
          ),
        )
        .orderBy(asc(course.code)),
    );
  }

  async get(tenantId: string, courseId: string) {
    const [row] = await withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(course)
        .where(and(eq(course.tenantId, tenantId), eq(course.id, courseId), isNull(course.deletedAt)))
        .limit(1),
    );
    if (!row) throw new NotFoundException("Course not found");
    return row;
  }
}

/**
 * Course catalogue. A course is owned by a department; creating one is gated by
 * `course.manage` resolved against the department's scope (HOD over their own
 * department, Dean across the faculty, registrar tenant-wide).
 */
@Controller()
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post("academic/departments/:departmentId/courses")
  @RequirePermission({ permission: PERMISSIONS.COURSE_MANAGE, departmentIdParam: "departmentId" })
  create(
    @CurrentPrincipal() p: Principal,
    @Param("departmentId") departmentId: string,
    @Body(new ZodValidationPipe(CreateCourseSchema)) body: z.infer<typeof CreateCourseSchema>,
  ) {
    return this.courses.create(p.tenantId, p.accountId, departmentId, body);
  }

  @Get("academic/departments/:departmentId/courses")
  @RequirePermission({ permission: PERMISSIONS.COURSE_READ, departmentIdParam: "departmentId" })
  listByDepartment(@CurrentPrincipal() p: Principal, @Param("departmentId") departmentId: string) {
    return this.courses.listByDepartment(p.tenantId, departmentId);
  }

  @Get("courses/:courseId")
  @RequirePermission({ permission: PERMISSIONS.COURSE_READ, courseIdParam: "courseId" })
  get(@CurrentPrincipal() p: Principal, @Param("courseId") courseId: string) {
    return this.courses.get(p.tenantId, courseId);
  }
}

@Module({ controllers: [CoursesController], providers: [CoursesService], exports: [CoursesService] })
export class CoursesModule {}
