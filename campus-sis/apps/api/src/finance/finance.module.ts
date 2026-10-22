import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Module,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { CurrentPrincipal, Public, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";
import { FinanceService } from "./finance.service.js";
import { PaymentService } from "./payment.service.js";
import { FlutterwaveAdapter } from "./flutterwave.adapter.js";

const FeeItemSchema = z.object({
  name: z.string().min(1).max(120),
  amountMinor: z.coerce.number().int().positive(),
  mandatory: z.boolean().optional(),
});
const CreateFeeStructureSchema = z.object({
  name: z.string().min(1).max(120),
  programmeId: z.string().uuid().optional(),
  level: z.coerce.number().int().min(100).max(900).optional(),
  items: z.array(FeeItemSchema).min(1),
});
const IssueInvoiceSchema = z.object({ feeStructureId: z.string().uuid() });

/**
 * Fees, invoices, ledger and payment initiation. Finance reads/writes are
 * scope-gated (bursar/registrar/admin by scope; a student reads and pays their
 * own via self scope).
 */
@Controller()
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly payments: PaymentService,
  ) {}

  @Post("academic/sessions/:sessionId/fee-structures")
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  createFeeStructure(
    @CurrentPrincipal() p: Principal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(CreateFeeStructureSchema)) body: z.infer<typeof CreateFeeStructureSchema>,
  ) {
    return this.finance.createFeeStructure(p.tenantId, p.accountId, sessionId, body);
  }

  @Get("academic/sessions/:sessionId/fee-structures")
  @RequirePermission(PERMISSIONS.FINANCE_READ)
  listFeeStructures(@CurrentPrincipal() p: Principal, @Param("sessionId") sessionId: string) {
    return this.finance.listFeeStructures(p.tenantId, sessionId);
  }

  @Post("students/:studentId/invoices")
  @RequirePermission({ permission: PERMISSIONS.FINANCE_MANAGE, studentIdParam: "studentId" })
  issueInvoice(
    @CurrentPrincipal() p: Principal,
    @Param("studentId") studentId: string,
    @Body(new ZodValidationPipe(IssueInvoiceSchema)) body: z.infer<typeof IssueInvoiceSchema>,
  ) {
    return this.finance.issueInvoice(p.tenantId, p.accountId, studentId, body.feeStructureId);
  }

  @Get("students/:studentId/invoices")
  @RequirePermission({ permission: PERMISSIONS.FINANCE_READ, studentIdParam: "studentId" })
  listInvoices(@CurrentPrincipal() p: Principal, @Param("studentId") studentId: string) {
    return this.finance.listInvoices(p.tenantId, studentId);
  }

  @Get("students/:studentId/ledger")
  @RequirePermission({ permission: PERMISSIONS.FINANCE_READ, studentIdParam: "studentId" })
  ledger(@CurrentPrincipal() p: Principal, @Param("studentId") studentId: string) {
    return this.finance.getLedger(p.tenantId, studentId);
  }

  @Post("students/:studentId/invoices/:invoiceId/pay")
  @HttpCode(200)
  @RequirePermission({ permission: PERMISSIONS.PAYMENT_INITIATE, studentIdParam: "studentId" })
  pay(
    @CurrentPrincipal() p: Principal,
    @Param("studentId") studentId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    return this.payments.initiate(p.tenantId, p.accountId, studentId, invoiceId);
  }
}

/**
 * Gateway webhook. Public (no session) but authenticated by the provider's
 * static verif-hash header; reconciliation is idempotent (see PaymentService).
 */
@Controller()
export class PaymentWebhookController {
  constructor(
    private readonly gateway: FlutterwaveAdapter,
    private readonly payments: PaymentService,
  ) {}

  @Public()
  @Post("webhooks/flutterwave")
  @HttpCode(200)
  async webhook(@Headers("verif-hash") hash: string | undefined, @Body() payload: unknown) {
    if (!this.gateway.verifyWebhook(hash)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    const event = this.gateway.parseEvent(payload);
    return this.payments.reconcile(event);
  }
}

@Module({
  controllers: [FinanceController, PaymentWebhookController],
  providers: [FinanceService, PaymentService, FlutterwaveAdapter],
  exports: [FinanceService, PaymentService],
})
export class FinanceModule {}
