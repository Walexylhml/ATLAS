import { Controller, Get, Module, Param, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";
import { ReportingService } from "./reporting.service.js";

/**
 * Financial reporting. The per-student statement is scope-gated by the student
 * (a student sees their own; staff by scope). The session-wide rollups carry no
 * student target, so only a tenant-scoped FINANCE_READ grant satisfies them —
 * a student's self-scoped grant cannot, which keeps cross-student figures to the
 * bursar / registrar / admin.
 */
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get("students/:studentId/statement")
  @RequirePermission({ permission: PERMISSIONS.FINANCE_READ, studentIdParam: "studentId" })
  statement(@CurrentPrincipal() p: Principal, @Param("studentId") studentId: string) {
    return this.reporting.studentStatement(p.tenantId, studentId);
  }

  @Get("academic/sessions/:sessionId/finance/summary")
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  summary(@CurrentPrincipal() p: Principal, @Param("sessionId") sessionId: string) {
    return this.reporting.sessionSummary(p.tenantId, sessionId);
  }

  @Get("academic/sessions/:sessionId/finance/aging")
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  aging(@CurrentPrincipal() p: Principal, @Param("sessionId") sessionId: string) {
    return this.reporting.agingReport(p.tenantId, sessionId);
  }

  @Get("academic/sessions/:sessionId/finance/outstanding")
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  outstanding(
    @CurrentPrincipal() p: Principal,
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
  ) {
    const n = limit ? Math.min(Math.max(Number(limit) || 100, 1), 500) : 100;
    return this.reporting.outstandingList(p.tenantId, sessionId, n);
  }

  @Get("academic/sessions/:sessionId/finance/payments")
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  payments(@CurrentPrincipal() p: Principal, @Param("sessionId") sessionId: string) {
    return this.reporting.paymentsReconciliation(p.tenantId, sessionId);
  }
}

@Module({
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
