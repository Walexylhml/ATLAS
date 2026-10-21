import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./_shared.js";
import {
  platformRoleEnum,
  tenantStatusEnum,
  tenantTypeEnum,
} from "./enums.js";

/**
 * PLATFORM domain — our company and the tenants we serve. These tables are NOT
 * tenant-scoped (no tenant_id, no RLS by tenant); `tenant` is the root every
 * tenant-owned row points back to.
 */

export const plan = pgTable("plan", {
  ...idColumn,
  name: text("name").notNull(),
  limits: jsonb("limits").notNull().default({}),
  priceMinor: text("price_minor"),
  currency: text("currency").notNull().default("NGN"),
  ...auditColumns,
});

export const tenant = pgTable("tenant", {
  ...idColumn,
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  type: tenantTypeEnum("type").notNull(),
  country: text("country").notNull().default("NG"),
  state: text("state"),
  status: tenantStatusEnum("status").notNull().default("onboarding"),
  planId: uuid("plan_id").references(() => plan.id),
  /** data-residency placement tier: shared | schema | dedicated:<region> */
  dataRegion: text("data_region").notNull().default("shared"),
  branding: jsonb("branding").notNull().default({}),
  ...auditColumns,
});

export const platformUser = pgTable("platform_user", {
  ...idColumn,
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("active"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  ...auditColumns,
});

export const platformRoleAssignment = pgTable("platform_role_assignment", {
  ...idColumn,
  platformUserId: uuid("platform_user_id")
    .notNull()
    .references(() => platformUser.id),
  role: platformRoleEnum("role").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  ...auditColumns,
});

export const breakGlassGrant = pgTable("break_glass_grant", {
  ...idColumn,
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenant.id),
  platformUserId: uuid("platform_user_id")
    .notNull()
    .references(() => platformUser.id),
  reason: text("reason").notNull(),
  approvedBy: uuid("approved_by"),
  consentRef: text("consent_ref"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  scope: jsonb("scope").notNull().default({}),
  ...auditColumns,
});
