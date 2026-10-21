import { bigint, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, softDelete, tenantColumn } from "./_shared.js";
import {
  invoiceStatusEnum,
  ledgerEntryTypeEnum,
  paymentProviderEnum,
  paymentStatusEnum,
} from "./enums.js";
import { academicSession, programme } from "./academic.js";
import { student } from "./records.js";

/**
 * STUDENT FINANCIALS (Phase 1 — the revenue core). Correctness-critical, so the
 * design is ledger-first: the append-only `ledger_entry` is the single source of
 * truth for money. A fee structure is a template; issuing an invoice posts a
 * `charge`; a confirmed payment posts a `payment`. Invoice balance is maintained
 * from those entries, never from a float. All amounts are integer MINOR units
 * (kobo) — see common/money.ts and data-model principle #10.
 */

/** A template of charges for a cohort (programme/level/session). */
export const feeStructure = pgTable(
  "fee_structure",
  {
    ...idColumn,
    ...tenantColumn,
    name: text("name").notNull(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => academicSession.id),
    // null programme/level = applies to all.
    programmeId: uuid("programme_id").references(() => programme.id),
    level: integer("level"),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("active"),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [unique("uq_fee_structure_tenant_name").on(t.tenantId, t.name)],
);

/** A single charge line within a fee structure. */
export const feeItem = pgTable("fee_item", {
  ...idColumn,
  ...tenantColumn,
  feeStructureId: uuid("fee_structure_id")
    .notNull()
    .references(() => feeStructure.id),
  name: text("name").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  mandatory: text("mandatory").notNull().default("true"),
  ...auditColumns,
});

/** A student's bill for a session, generated from a fee structure. */
export const invoice = pgTable("invoice", {
  ...idColumn,
  ...tenantColumn,
  studentId: uuid("student_id")
    .notNull()
    .references(() => student.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => academicSession.id),
  feeStructureId: uuid("fee_structure_id").references(() => feeStructure.id),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  currency: text("currency").notNull().default("NGN"),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
  // Maintained from ledger entries; never a derived float.
  balanceMinor: bigint("balance_minor", { mode: "number" }).notNull().default(0),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  ...auditColumns,
  ...softDelete,
});

export const invoiceLine = pgTable("invoice_line", {
  ...idColumn,
  ...tenantColumn,
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id),
  description: text("description").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  ...auditColumns,
});

/**
 * Append-only money ledger — the system of record. A `charge` is positive
 * (increases what the student owes), a `payment` negative. A student's balance
 * is the sum of their entries. No UPDATE/DELETE policy exists, so under FORCE
 * RLS these rows are immutable once written (corrections are reversal entries).
 */
export const ledgerEntry = pgTable("ledger_entry", {
  ...idColumn,
  ...tenantColumn,
  studentId: uuid("student_id")
    .notNull()
    .references(() => student.id),
  invoiceId: uuid("invoice_id").references(() => invoice.id),
  paymentId: uuid("payment_id"),
  type: ledgerEntryTypeEnum("type").notNull(),
  // Signed integer minor units: +charge, -payment.
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  memo: text("memo"),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

/**
 * A payment attempt via a gateway. Keyed by the provider's reference so webhook
 * reconciliation is idempotent — the same event can never credit the ledger
 * twice.
 */
export const payment = pgTable(
  "payment",
  {
    ...idColumn,
    ...tenantColumn,
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id),
    invoiceId: uuid("invoice_id").references(() => invoice.id),
    provider: paymentProviderEnum("provider").notNull().default("flutterwave"),
    // The gateway transaction reference (tx_ref) — unique within the tenant.
    providerRef: text("provider_ref").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    rawPayload: jsonb("raw_payload"),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [unique("uq_payment_tenant_provider_ref").on(t.tenantId, t.providerRef)],
);
