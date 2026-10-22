import { Body, Controller, Get, HttpCode, Module, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";
import { ConfigModule } from "../config/config.module.js";
import { HoldsService } from "./holds.service.js";

const PlaceHoldSchema = z.object({
  type: z.enum(["financial", "library", "disciplinary", "medical", "academic", "documents", "other"]),
  reason: z.string().min(1).max(500),
  blocksRegistration: z.boolean().optional(),
});
const LiftHoldSchema = z.object({ reason: z.string().max(500).optional() });

/**
 * Student holds. Reading is scope-gated (a student reads their own via self
 * scope; staff by scope). Placing/lifting needs hold.manage (registrar, bursar,
 * admin, and scope-gated dean/HOD). The financial hold is derived, so it appears
 * in reads but cannot be placed or lifted here — it clears when the balance does.
 */
@Controller()
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Get("students/:studentId/holds")
  @RequirePermission({ permission: PERMISSIONS.HOLD_READ, studentIdParam: "studentId" })
  async list(@CurrentPrincipal() p: Principal, @Param("studentId") studentId: string) {
    const [effective, history] = await Promise.all([
      this.holds.listEffective(p.tenantId, studentId),
      this.holds.listManual(p.tenantId, studentId),
    ]);
    return { ...effective, history };
  }

  @Post("students/:studentId/holds")
  @RequirePermission({ permission: PERMISSIONS.HOLD_MANAGE, studentIdParam: "studentId" })
  place(
    @CurrentPrincipal() p: Principal,
    @Param("studentId") studentId: string,
    @Body(new ZodValidationPipe(PlaceHoldSchema)) body: z.infer<typeof PlaceHoldSchema>,
  ) {
    return this.holds.place(p.tenantId, p.accountId, studentId, body);
  }

  @Post("students/:studentId/holds/:holdId/lift")
  @HttpCode(200)
  @RequirePermission({ permission: PERMISSIONS.HOLD_MANAGE, studentIdParam: "studentId" })
  lift(
    @CurrentPrincipal() p: Principal,
    @Param("studentId") studentId: string,
    @Param("holdId") holdId: string,
    @Body(new ZodValidationPipe(LiftHoldSchema)) body: z.infer<typeof LiftHoldSchema>,
  ) {
    return this.holds.lift(p.tenantId, p.accountId, studentId, holdId, body.reason);
  }
}

@Module({
  imports: [ConfigModule],
  controllers: [HoldsController],
  providers: [HoldsService],
  exports: [HoldsService],
})
export class HoldsModule {}
