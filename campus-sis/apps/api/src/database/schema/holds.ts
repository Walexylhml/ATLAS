import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantColumn } from "./_shared.js";
import { holdStatusEnum, holdTypeEnum } from "./enums.js";
import { student } from "./records.js";

/**
 * STUDENT HOLDS (negative service indicators). A manual hold placed by staff
 * that gates an action — first, course registration — until lifted. The
 * FINANCIAL hold is not stored here: it is derived from the ledger balance vs.
 * a tenant threshold at check time (see HoldsService), so the append-only
 * ledger stays the single source of truth for money.
 */
export const studentHold = pgTable("student_hold", {
  ...idColumn,
  ...tenantColumn,
  studentId: uuid("student_id")
    .notNull()
    .references(() => student.id),
  type: holdTypeEnum("type").notNull().default("other"),
  reason: text("reason").notNull(),
  status: holdStatusEnum("status").notNull().default("active"),
  // Whether this hold gates course registration (false = informational only).
  blocksRegistration: boolean("blocks_registration").notNull().default(true),
  placedBy: uuid("placed_by"),
  placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
  liftedBy: uuid("lifted_by"),
  liftedAt: timestamp("lifted_at", { withTimezone: true }),
  liftReason: text("lift_reason"),
  ...auditColumns,
});
