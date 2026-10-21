import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./_shared.js";
import {
  actorTypeEnum,
  documentSensitivityEnum,
  outboxStatusEnum,
} from "./enums.js";

/**
 * Cross-cutting infrastructure: audit, transactional outbox, config, documents.
 * These are load-bearing for every domain (data-model section 11).
 */

/** Append-only. The record of who did what. Immutable once written. */
export const auditLog = pgTable("audit_log", {
  ...idColumn,
  // nullable: platform-level actions have no tenant
  tenantId: uuid("tenant_id"),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  assuranceLevel: text("assurance_level"),
  breakGlassRef: uuid("break_glass_ref"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional outbox — written in the SAME transaction as the state change it
 * describes, so a crash can never lose a side effect. A dispatcher relays rows to
 * notifications / reconciliation / analytics and marks them dispatched.
 */
export const eventOutbox = pgTable("event_outbox", {
  ...idColumn,
  tenantId: uuid("tenant_id"),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: outboxStatusEnum("status").notNull().default("pending"),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
  lastError: text("last_error"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
});

/** All tenant configuration — versioned, effective-dated, resolved at runtime. */
export const config = pgTable("config", {
  ...idColumn,
  tenantId: uuid("tenant_id").notNull(),
  namespace: text("namespace").notNull(),
  key: text("key").notNull(),
  value: jsonb("value").notNull().default({}),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  ...auditColumns,
});

/** Metadata + access control for a binary that lives in object storage. */
export const document = pgTable("document", {
  ...idColumn,
  tenantId: uuid("tenant_id").notNull(),
  ownerPersonId: uuid("owner_person_id"),
  type: text("type").notNull(),
  filename: text("filename").notNull(),
  storageRef: text("storage_ref").notNull(),
  contentType: text("content_type"),
  size: bigint("size", { mode: "number" }),
  checksum: text("checksum"),
  sensitivity: documentSensitivityEnum("sensitivity").notNull().default("internal"),
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
