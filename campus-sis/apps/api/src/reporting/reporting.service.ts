import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { format, money } from "../common/money.js";
import { withTenant } from "../database/rls.js";
import {
  invoice,
  ledgerEntry,
  payment,
  person,
  student,
} from "../database/schema/index.js";

/** One day in milliseconds — aging is measured in whole days. */
const DAY_MS = 86_400_000;

export const AGING_BUCKETS = [
  { key: "not_due", label: "Not yet due", min: -Infinity, max: 0 },
  { key: "d1_30", label: "1–30 days", min: 1, max: 30 },
  { key: "d31_60", label: "31–60 days", min: 31, max: 60 },
  { key: "d61_90", label: "61–90 days", min: 61, max: 90 },
  { key: "d90_plus", label: "90+ days", min: 91, max: Infinity },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

/** Whole days a date is overdue as of `asOf` (negative ⇒ not yet due). Pure. */
export function daysOverdue(due: Date, asOf: Date): number {
  return Math.floor((asOf.getTime() - due.getTime()) / DAY_MS);
}

/** Which aging bucket a given overdue-day count falls in. Pure. */
export function bucketFor(days: number): AgingBucketKey {
  for (const b of AGING_BUCKETS) {
    if (days >= b.min && days <= b.max) return b.key;
  }
  return "d90_plus";
}

export interface AgingItem {
  days: number;
  balanceMinor: number;
}

/** Roll outstanding items into aging buckets. Pure — unit-tested without a DB. */
export function rollupAging(items: AgingItem[]) {
  const acc: Record<AgingBucketKey, { count: number; amountMinor: number }> = {
    not_due: { count: 0, amountMinor: 0 },
    d1_30: { count: 0, amountMinor: 0 },
    d31_60: { count: 0, amountMinor: 0 },
    d61_90: { count: 0, amountMinor: 0 },
    d90_plus: { count: 0, amountMinor: 0 },
  };
  for (const it of items) {
    const b = acc[bucketFor(it.days)];
    b.count += 1;
    b.amountMinor += it.balanceMinor;
  }
  const totalOutstandingMinor = items.reduce((s, it) => s + it.balanceMinor, 0);
  return {
    totalOutstandingMinor,
    buckets: AGING_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      count: acc[b.key].count,
      amountMinor: acc[b.key].amountMinor,
    })),
  };
}

export interface InvoiceRollupRow {
  totalMinor: number;
  balanceMinor: number;
  status: string;
}

/** Collections rollup over a set of invoices. Pure. */
export function summarizeInvoices(rows: InvoiceRollupRow[]) {
  const billedMinor = rows.reduce((s, r) => s + r.totalMinor, 0);
  const outstandingMinor = rows.reduce((s, r) => s + r.balanceMinor, 0);
  const collectedMinor = billedMinor - outstandingMinor;
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const collectionRatePct = billedMinor > 0 ? Math.round((collectedMinor / billedMinor) * 10000) / 100 : 0;
  return {
    invoiceCount: rows.length,
    billedMinor,
    collectedMinor,
    outstandingMinor,
    collectionRatePct,
    byStatus,
  };
}

const naira = (minor: number) => ({ minor, formatted: format(money(minor, "NGN")) });

/**
 * Bursar-facing financial reporting over the invoices, ledger and payments from
 * the financials slice. All read-only aggregates. Per-student statement is
 * scope-gated by the student; session-wide rollups are tenant-scoped (a student's
 * self grant can't satisfy a no-target FINANCE_READ check, so they are blocked).
 */
@Injectable()
export class ReportingService {
  /** A single student's financial statement: invoices, ledger and balance. */
  async studentStatement(tenantId: string, studentId: string) {
    return withTenant({ tenantId }, async (db) => {
      const [stu] = await db
        .select({
          id: student.id,
          matricNo: student.matricNo,
          surname: person.surname,
          firstName: person.firstName,
        })
        .from(student)
        .innerJoin(person, eq(person.id, student.personId))
        .where(and(eq(student.tenantId, tenantId), eq(student.id, studentId), isNull(student.deletedAt)))
        .limit(1);
      if (!stu) throw new NotFoundException("Student not found");

      const invoices = await db
        .select()
        .from(invoice)
        .where(and(eq(invoice.tenantId, tenantId), eq(invoice.studentId, studentId), isNull(invoice.deletedAt)))
        .orderBy(asc(invoice.issuedAt));

      const ledger = await db
        .select()
        .from(ledgerEntry)
        .where(and(eq(ledgerEntry.tenantId, tenantId), eq(ledgerEntry.studentId, studentId)))
        .orderBy(asc(ledgerEntry.createdAt));

      const balanceMinor = ledger.reduce((s, e) => s + e.amountMinor, 0);
      return {
        student: { id: stu.id, matricNo: stu.matricNo, name: `${stu.firstName} ${stu.surname}` },
        currency: "NGN",
        balance: naira(balanceMinor),
        invoices,
        ledger,
      };
    });
  }

  /** Collections summary for a session: billed / collected / outstanding + counts. */
  async sessionSummary(tenantId: string, sessionId: string) {
    return withTenant({ tenantId }, async (db) => {
      const rows = await db
        .select({ totalMinor: invoice.totalMinor, balanceMinor: invoice.balanceMinor, status: invoice.status })
        .from(invoice)
        .where(and(eq(invoice.tenantId, tenantId), eq(invoice.sessionId, sessionId), isNull(invoice.deletedAt)));

      const s = summarizeInvoices(rows);
      const studentsRow = await db.execute(sql`
        SELECT count(DISTINCT student_id)::int AS billed,
               count(DISTINCT student_id) FILTER (WHERE balance_minor > 0)::int AS owing
        FROM invoice
        WHERE tenant_id = ${tenantId} AND session_id = ${sessionId} AND deleted_at IS NULL
      `);
      const sc = (studentsRow as unknown as { rows: { billed: number; owing: number }[] }).rows[0];
      return {
        sessionId,
        currency: "NGN",
        invoiceCount: s.invoiceCount,
        billed: naira(s.billedMinor),
        collected: naira(s.collectedMinor),
        outstanding: naira(s.outstandingMinor),
        collectionRatePct: s.collectionRatePct,
        byStatus: s.byStatus,
        studentsBilled: sc?.billed ?? 0,
        studentsOwing: sc?.owing ?? 0,
      };
    });
  }

  /** Aging of outstanding invoices for a session, bucketed by days past due. */
  async agingReport(tenantId: string, sessionId: string, asOf: Date = new Date()) {
    return withTenant({ tenantId }, async (db) => {
      const rows = await db
        .select({
          balanceMinor: invoice.balanceMinor,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.tenantId, tenantId),
            eq(invoice.sessionId, sessionId),
            isNull(invoice.deletedAt),
            sql`${invoice.balanceMinor} > 0`,
            sql`${invoice.status} IN ('issued','part_paid')`,
          ),
        );

      const items: AgingItem[] = rows.map((r) => {
        // Age from the due date, falling back to the issue date when none is set.
        const due = r.dueAt ?? r.issuedAt ?? asOf;
        return { days: daysOverdue(due, asOf), balanceMinor: r.balanceMinor };
      });
      const rolled = rollupAging(items);
      return {
        sessionId,
        currency: "NGN",
        asOf: asOf.toISOString(),
        outstanding: naira(rolled.totalOutstandingMinor),
        buckets: rolled.buckets.map((b) => ({ ...b, amount: naira(b.amountMinor) })),
      };
    });
  }

  /** Students with an outstanding balance in a session, largest first. */
  async outstandingList(tenantId: string, sessionId: string, limit = 100) {
    return withTenant({ tenantId }, async (db) => {
      const result = await db.execute(sql`
        SELECT s.id                         AS student_id,
               s.matric_no                  AS matric_no,
               pe.first_name || ' ' || pe.surname AS name,
               SUM(i.balance_minor)::bigint AS outstanding_minor,
               count(*)::int                AS invoice_count,
               min(i.issued_at)             AS oldest_issued_at
        FROM invoice i
        JOIN student s ON s.id = i.student_id
        JOIN person pe ON pe.id = s.person_id
        WHERE i.tenant_id = ${tenantId} AND i.session_id = ${sessionId}
          AND i.deleted_at IS NULL AND i.balance_minor > 0
        GROUP BY s.id, s.matric_no, pe.first_name, pe.surname
        ORDER BY outstanding_minor DESC
        LIMIT ${limit}
      `);
      const rows = (result as unknown as {
        rows: { student_id: string; matric_no: string | null; name: string; outstanding_minor: string; invoice_count: number; oldest_issued_at: string }[];
      }).rows;
      const students = rows.map((r) => ({
        studentId: r.student_id,
        matricNo: r.matric_no,
        name: r.name,
        outstanding: naira(Number(r.outstanding_minor)),
        invoiceCount: r.invoice_count,
        oldestIssuedAt: r.oldest_issued_at,
      }));
      return {
        sessionId,
        currency: "NGN",
        count: students.length,
        totalOutstanding: naira(students.reduce((s, r) => s + r.outstanding.minor, 0)),
        students,
      };
    });
  }

  /**
   * Payments reconciliation for a session: gateway transactions grouped by
   * status, plus the pending/failed tail to chase. Reconcile the successful
   * total against the gateway's own settlement report.
   */
  async paymentsReconciliation(tenantId: string, sessionId: string) {
    return withTenant({ tenantId }, async (db) => {
      const grouped = await db.execute(sql`
        SELECT p.status AS status, count(*)::int AS count, SUM(p.amount_minor)::bigint AS amount_minor
        FROM payment p
        JOIN invoice i ON i.id = p.invoice_id
        WHERE p.tenant_id = ${tenantId} AND i.session_id = ${sessionId}
        GROUP BY p.status
      `);
      const byStatus = (grouped as unknown as {
        rows: { status: string; count: number; amount_minor: string }[];
      }).rows.map((r) => ({ status: r.status, count: r.count, amount: naira(Number(r.amount_minor)) }));

      const successfulMinor = byStatus
        .filter((r) => r.status === "successful")
        .reduce((s, r) => s + r.amount.minor, 0);

      const open = await db
        .select({
          id: payment.id,
          studentId: payment.studentId,
          providerRef: payment.providerRef,
          status: payment.status,
          amountMinor: payment.amountMinor,
          initiatedAt: payment.initiatedAt,
        })
        .from(payment)
        .innerJoin(invoice, eq(invoice.id, payment.invoiceId))
        .where(
          and(
            eq(payment.tenantId, tenantId),
            eq(invoice.sessionId, sessionId),
            sql`${payment.status} IN ('pending','failed')`,
          ),
        )
        .orderBy(asc(payment.initiatedAt));

      return {
        sessionId,
        currency: "NGN",
        byStatus,
        successfulTotal: naira(successfulMinor),
        openCount: open.length,
        open,
      };
    });
  }
}
