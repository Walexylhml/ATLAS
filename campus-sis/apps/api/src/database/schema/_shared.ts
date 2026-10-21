import { sql } from "drizzle-orm";
import { integer, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Columns every table carries (data-model principle #9). Spread into each
 * pgTable definition so the shape is identical and enforced everywhere.
 */
export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedBy: uuid("updated_by"),
  /** optimistic-lock counter; bumped on every update */
  version: integer("version").notNull().default(1),
};

/** Soft-delete marker for records of consequence (principle #4). */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

/** Primary key: time-ordered UUID generated in the app layer (principle #2). */
export const idColumn = {
  id: uuid("id").primaryKey(),
};

/** Non-null tenant discriminator present on every tenant-owned table (principle #1). */
export const tenantColumn = {
  tenantId: uuid("tenant_id").notNull(),
};
