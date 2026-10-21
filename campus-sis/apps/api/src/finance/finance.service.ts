import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { withTenant } from "../database/rls.js";
import {
  feeItem,
  feeStructure,
  invoice,
  invoiceLine,
  ledgerEntry,
  student,
} from "../database/schema/index.js";

export interface FeeItemInput {
  name: string;
  amountMinor: number;
  mandatory?: boolean;
}

/**
 * Fees, invoicing and the money ledger. Issuing an invoice posts a `charge` to
 * the append-only ledger; the ledger is the source of truth and the invoice
 * balance is maintained from it (see PaymentService for the `payment` side).
 */
@Injectable()
export class FinanceService {
  async createFeeStructure(
    tenantId: string,
    actorId: string,
    sessionId: string,
    input: { name: string; programmeId?: string; level?: number; items: FeeItemInput[] },
  ) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const structureId = newId();
      const [structure] = await db
        .insert(feeStructure)
        .values({
          id: structureId,
          tenantId,
          name: input.name,
          sessionId,
          programmeId: input.programmeId ?? null,
          level: input.level ?? null,
          createdBy: actorId,
        })
        .returning();
      if (input.items.length > 0) {
        await db.insert(feeItem).values(
          input.items.map((it) => ({
            id: newId(),
            tenantId,
            feeStructureId: structureId,
            name: it.name,
            amountMinor: it.amountMinor,
            mandatory: String(it.mandatory ?? true),
            createdBy: actorId,
          })),
        );
      }
      return structure;
    });
  }

  listFeeStructures(tenantId: string, sessionId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(feeStructure)
        .where(
          and(
            eq(feeStructure.tenantId, tenantId),
            eq(feeStructure.sessionId, sessionId),
            isNull(feeStructure.deletedAt),
          ),
        ),
    );
  }

  /** Issue an invoice for a student from a fee structure: lines + a ledger charge. */
  async issueInvoice(tenantId: string, actorId: string, studentId: string, feeStructureId: string) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [fs] = await db
        .select()
        .from(feeStructure)
        .where(
          and(
            eq(feeStructure.tenantId, tenantId),
            eq(feeStructure.id, feeStructureId),
            isNull(feeStructure.deletedAt),
          ),
        )
        .limit(1);
      if (!fs) throw new NotFoundException("Fee structure not found");

      const [stu] = await db
        .select({ id: student.id })
        .from(student)
        .where(and(eq(student.tenantId, tenantId), eq(student.id, studentId), isNull(student.deletedAt)))
        .limit(1);
      if (!stu) throw new NotFoundException("Student not found");

      const items = await db
        .select()
        .from(feeItem)
        .where(and(eq(feeItem.tenantId, tenantId), eq(feeItem.feeStructureId, feeStructureId)));
      if (items.length === 0) throw new BadRequestException("Fee structure has no items");

      // One live invoice per (student, fee structure) — never double-charge.
      const [dup] = await db
        .select({ id: invoice.id })
        .from(invoice)
        .where(
          and(
            eq(invoice.tenantId, tenantId),
            eq(invoice.studentId, studentId),
            eq(invoice.feeStructureId, feeStructureId),
            ne(invoice.status, "void"),
          ),
        )
        .limit(1);
      if (dup) throw new ConflictException("Invoice already issued for this fee structure");

      const totalMinor = items.reduce((sum, it) => sum + it.amountMinor, 0);
      const invoiceId = newId();
      const [inv] = await db
        .insert(invoice)
        .values({
          id: invoiceId,
          tenantId,
          studentId,
          sessionId: fs.sessionId,
          feeStructureId,
          status: "issued",
          currency: fs.currency,
          totalMinor,
          balanceMinor: totalMinor,
          issuedAt: new Date(),
          createdBy: actorId,
        })
        .returning();

      await db.insert(invoiceLine).values(
        items.map((it) => ({
          id: newId(),
          tenantId,
          invoiceId,
          description: it.name,
          amountMinor: it.amountMinor,
          createdBy: actorId,
        })),
      );

      // Post the charge to the ledger (positive = owed).
      await db.insert(ledgerEntry).values({
        id: newId(),
        tenantId,
        studentId,
        invoiceId,
        type: "charge",
        amountMinor: totalMinor,
        currency: fs.currency,
        memo: `Invoice: ${fs.name}`,
        reference: invoiceId,
        createdBy: actorId,
      });

      return inv;
    });
  }

  listInvoices(tenantId: string, studentId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(invoice)
        .where(
          and(
            eq(invoice.tenantId, tenantId),
            eq(invoice.studentId, studentId),
            isNull(invoice.deletedAt),
          ),
        )
        .orderBy(asc(invoice.issuedAt)),
    );
  }

  /** A student's ledger plus their outstanding balance (sum of entries). */
  async getLedger(tenantId: string, studentId: string) {
    return withTenant({ tenantId }, async (db) => {
      const entries = await db
        .select()
        .from(ledgerEntry)
        .where(and(eq(ledgerEntry.tenantId, tenantId), eq(ledgerEntry.studentId, studentId)))
        .orderBy(asc(ledgerEntry.createdAt));
      const sums = await db
        .select({ balance: sql<number>`COALESCE(SUM(${ledgerEntry.amountMinor}), 0)::bigint` })
        .from(ledgerEntry)
        .where(and(eq(ledgerEntry.tenantId, tenantId), eq(ledgerEntry.studentId, studentId)));
      return { entries, balanceMinor: Number(sums[0]?.balance ?? 0) };
    });
  }
}
