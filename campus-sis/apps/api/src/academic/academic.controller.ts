import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";
import { AcademicService } from "./academic.service.js";

const Code = z.string().min(1).max(32);
const Name = z.string().min(1).max(200);

const CreateSchoolSchema = z.object({ code: Code, name: Name });
const CreateFacultySchema = z.object({ schoolId: z.string().uuid().optional(), code: Code, name: Name });
const CreateDepartmentSchema = z.object({ code: Code, name: Name });
const CreateProgrammeSchema = z.object({
  code: Code,
  name: Name,
  award: z.string().min(1).max(64),
  durationYears: z.coerce.number().int().min(1).max(10).default(4),
  maxLevel: z.coerce.number().int().min(100).max(900).default(400),
});

/**
 * Academic structure, calendar and grading. Reads require `academic.read`,
 * writes `academic.manage` — both resolved against the scope ladder, so a Dean
 * scoped to a faculty can manage that faculty's departments while a tenant-scoped
 * admin manages everything. (See docs/10.)
 */
@Controller("academic")
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Get("schools")
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  listSchools(@CurrentPrincipal() p: Principal) {
    return this.academic.listSchools(p.tenantId);
  }

  @Post("schools")
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  createSchool(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(CreateSchoolSchema)) body: z.infer<typeof CreateSchoolSchema>,
  ) {
    return this.academic.createSchool(p.tenantId, p.accountId, body);
  }

  @Get("faculties")
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  listFaculties(@CurrentPrincipal() p: Principal, @Query("schoolId") schoolId?: string) {
    return this.academic.listFaculties(p.tenantId, schoolId);
  }

  @Post("faculties")
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  createFaculty(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(CreateFacultySchema)) body: z.infer<typeof CreateFacultySchema>,
  ) {
    return this.academic.createFaculty(p.tenantId, p.accountId, body);
  }

  @Get("faculties/:facultyId/departments")
  @RequirePermission({ permission: PERMISSIONS.ACADEMIC_READ, facultyIdParam: "facultyId" })
  listDepartments(@CurrentPrincipal() p: Principal, @Param("facultyId") facultyId: string) {
    return this.academic.listDepartments(p.tenantId, facultyId);
  }

  @Post("faculties/:facultyId/departments")
  @RequirePermission({ permission: PERMISSIONS.ACADEMIC_MANAGE, facultyIdParam: "facultyId" })
  createDepartment(
    @CurrentPrincipal() p: Principal,
    @Param("facultyId") facultyId: string,
    @Body(new ZodValidationPipe(CreateDepartmentSchema)) body: z.infer<typeof CreateDepartmentSchema>,
  ) {
    return this.academic.createDepartment(p.tenantId, p.accountId, facultyId, body);
  }

  @Get("departments/:departmentId/programmes")
  @RequirePermission({ permission: PERMISSIONS.ACADEMIC_READ, departmentIdParam: "departmentId" })
  listProgrammes(@CurrentPrincipal() p: Principal, @Param("departmentId") departmentId: string) {
    return this.academic.listProgrammes(p.tenantId, departmentId);
  }

  @Post("departments/:departmentId/programmes")
  @RequirePermission({ permission: PERMISSIONS.ACADEMIC_MANAGE, departmentIdParam: "departmentId" })
  createProgramme(
    @CurrentPrincipal() p: Principal,
    @Param("departmentId") departmentId: string,
    @Body(new ZodValidationPipe(CreateProgrammeSchema)) body: z.infer<typeof CreateProgrammeSchema>,
  ) {
    return this.academic.createProgramme(p.tenantId, p.accountId, departmentId, body);
  }

  @Get("programmes/:programmeId")
  @RequirePermission({ permission: PERMISSIONS.ACADEMIC_READ, programmeIdParam: "programmeId" })
  getProgramme(@CurrentPrincipal() p: Principal, @Param("programmeId") programmeId: string) {
    return this.academic.getProgramme(p.tenantId, programmeId);
  }

  @Get("calendar/current")
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  calendar(@CurrentPrincipal() p: Principal) {
    return this.academic.currentCalendar(p.tenantId);
  }

  @Get("grading/default")
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  grading(@CurrentPrincipal() p: Principal) {
    return this.academic.defaultGrading(p.tenantId);
  }
}
