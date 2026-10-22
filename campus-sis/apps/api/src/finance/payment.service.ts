import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { withPlatform, withTenant } from "../database/rls.js";
import { invoice, ledgerEntry, payment, person, student } from "../database/schema/index.js";
import { FlutterwaveAdapter, type GatewayEvent } from "./flutterwave.adapter.js";

export interface ReconcileResult {
  status: "reconciled" | "duplicate" | "failed" | "ignored";
  reason?: string;
  paymentId?: string;
}

@Injectable()
export class PaymentService {
  private readonly log = new Logger(PaymentService.name);

  constructor(private readonly gateway: FlutterwaveAdapter) {}

  /** Initiate a payment for an invoice's outstanding balance; returns a checkout link. */
  async initiate(tenantId: string, actorId: string, studentId: string, invoiceId: string) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [inv] = await db
        .select()
        .from(invoice)
        .where(
          and(
            eq(invoice.tenantId, tenantId),
            eq(invoice.id, invoiceId),
            eq(invoice.studentId, studentId),
            isNull(invoice.deletedAt),
          ),
        )
        .limit(1);
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.status === "paid" || inv.balanceMinor <= 0) {
        throw new BadRequestException("Invoice has nothing to pay");
      }

      const [who] = await db
        .select({ email: person.primaryEmail, surname: person.surname, firstName: person.firstName })
        .from(student)
        .innerJoin(person, eq(person.id, student.personId))
        .where(eq(student.id, studentId))
        .limit(1);

      const providerRef = `ATLAS-${invoiceId.slice(0, 8)}-${randomBytes(4).toString("hex")}`;
      const amountMinor = inv.balanceMinor;
      const paymentId = newId();
      await db.insert(payment).values({
        id: paymentId,
        tenantId,
        studentId,
        invoiceId,
        provider: "flutterwave",
        providerRef,
        amountMinor,
        currency: inv.currency,
        createdBy: actorId,
      });

      const link = await this.gateway.initiate({
        ref: providerRef,
        amountMajor: amountMinor / 100,
        currency: inv.currency,
        email: who?.email ?? undefined,
        name: who ? `${who.firstName} ${who.surname}` : undefined,
      });

      return { paymentId, providerRef, amountMinor, link: link.link, stub: link.stub };
    });
  }

  /**
   * Reconcile a verified gateway event. Idempotent: the conditional UPDATE
   * (status != 'successful') is the race-safe guard, so a duplicate webhook can
   * never post the ledger payment twice. Webhooks are tenant-agnostic, so the
   * payment is first located cross-tenant (platform context) to find its tenant.
   */
  async reconcile(event: GatewayEvent): Promise<ReconcileResult> {
    if (!event.providerRef) return { status: "ignored", reason: "no provider ref" };

    const [found] = await withPlatform(undefined, (db) =>
      db
        .select({
          id: payment.id,
          tenantId: payment.tenantId,
          invoiceId: payment.invoiceId,
          studentId: payment.studentId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          status: payment.status,
        })
        .from(payment)
        .where(eq(payment.providerRef, event.providerRef!))
        .limit(1),
    );
    if (!found) return { status: "ignored", reason: "unknown reference" };
    if (found.status === "successful") return { status: "duplicate", paymentId: found.id };

    return withTenant({ tenantId: found.tenantId }, async (db) => {
      if (event.status !== "successful") {
        await db
          .update(payment)
          .set({ status: "failed", rawPayload: event.raw as object, updatedAt: new Date() })
          .where(and(eq(payment.id, found.id), eq(payment.status, "pending")));
        return { status: "failed", paymentId: found.id };
      }

      // Atomic idempotency guard: only the first success transitions the row.
      const transitioned = await db
        .update(payment)
        .set({
          status: "successful",
          confirmedAt: new Date(),
          rawPayload: event.raw as object,
          updatedAt: new Date(),
        })
        .where(and(eq(payment.id, found.id), ne(payment.status, "successful")))
        .returning({ id: payment.id });
      if (transitioned.length === 0) return { status: "duplicate", paymentId: found.id };

      await db.insert(ledgerEntry).values({
        id: newId(),
        tenantId: found.tenantId,
        studentId: found.studentId,
        invoiceId: found.invoiceId,
        paymentId: found.id,
        type: "payment",
        amountMinor: -found.amountMinor,
        currency: found.currency,
        memo: "Payment received",
        reference: event.providerRef,
      });

      if (found.invoiceId) {
        const [inv] = await db
          .select({ balanceMinor: invoice.balanceMinor })
          .from(invoice)
          .where(eq(invoice.id, found.invoiceId))
          .limit(1);
        const newBalance = (inv?.balanceMinor ?? 0) - found.amountMinor;
        await db
          .update(invoice)
          .set({
            balanceMinor: newBalance,
            status: newBalance <= 0 ? "paid" : "part_paid",
            updatedAt: new Date(),
          })
          .where(eq(invoice.id, found.invoiceId));
      }

      this.log.log(`reconciled payment=${found.id} tenant=${found.tenantId}`);
      return { status: "reconciled", paymentId: found.id };
    });
  }
}
