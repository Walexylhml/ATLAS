import {
  boolean,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, idColumn, softDelete, tenantColumn } from "./_shared.js";
import {
  accountStatusEnum,
  authMethodEnum,
  consentStateEnum,
  indicatorPolarityEnum,
  personStatusEnum,
  relationshipTypeEnum,
  scopeTypeEnum,
} from "./enums.js";

/**
 * IDENTITY domain (Campus Community). One `person` per human within a tenant;
 * applicant, student, staff and parent are all a person first (design north star:
 * one identity, many modules).
 */

export const person = pgTable("person", {
  ...idColumn,
  ...tenantColumn,
  title: text("title"),
  surname: text("surname").notNull(),
  firstName: text("first_name").notNull(),
  otherNames: text("other_names"),
  dob: date("dob"),
  gender: text("gender"),
  nationality: text("nationality").default("NG"),
  stateOfOrigin: text("state_of_origin"),
  lga: text("lga"),
  maritalStatus: text("marital_status"),
  // PII-sensitive — classified for field-level access & encryption later.
  religion: text("religion"),
  disabilityNeeds: text("disability_needs"),
  photoDocId: uuid("photo_doc_id"),
  primaryEmail: text("primary_email"),
  primaryPhone: text("primary_phone"),
  status: personStatusEnum("status").notNull().default("active"),
  ...auditColumns,
  ...softDelete,
});

export const userAccount = pgTable(
  "user_account",
  {
    ...idColumn,
    ...tenantColumn,
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    username: text("username"),
    email: text("email"),
    phone: text("phone"),
    authMethod: authMethodEnum("auth_method").notNull().default("otp"),
    passwordHash: text("password_hash"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    status: accountStatusEnum("status").notNull().default("invited"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...auditColumns,
    ...softDelete,
  },
  (t) => [
    unique("uq_user_account_tenant_username").on(t.tenantId, t.username),
    unique("uq_user_account_tenant_phone").on(t.tenantId, t.phone),
  ],
);

export const role = pgTable(
  "role",
  {
    ...idColumn,
    // nullable tenant_id => a platform-defined role template shared by all tenants
    tenantId: uuid("tenant_id"),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...auditColumns,
  },
  (t) => [unique("uq_role_tenant_key").on(t.tenantId, t.key)],
);

export const permission = pgTable("permission", {
  ...idColumn,
  key: text("key").notNull().unique(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  requiresStepUp: boolean("requires_step_up").notNull().default(false),
  relationshipPredicate: text("relationship_predicate"),
  catalogueVersion: text("catalogue_version").notNull().default("1"),
  ...auditColumns,
});

export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id),
  },
  (t) => [unique("uq_role_permission").on(t.roleId, t.permissionId)],
);

/** The heart of RBAC — effective-dated, scoped grant of a role to an account. */
export const roleAssignment = pgTable("role_assignment", {
  ...idColumn,
  ...tenantColumn,
  userAccountId: uuid("user_account_id")
    .notNull()
    .references(() => userAccount.id),
  roleId: uuid("role_id")
    .notNull()
    .references(() => role.id),
  scopeType: scopeTypeEnum("scope_type").notNull().default("tenant"),
  scopeRefId: uuid("scope_ref_id"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  grantedBy: uuid("granted_by"),
  status: text("status").notNull().default("active"),
  ...auditColumns,
});

/** Parent/guardian/sponsor links — drives NDPA-consented parent visibility. */
export const relationship = pgTable("relationship", {
  ...idColumn,
  ...tenantColumn,
  fromPersonId: uuid("from_person_id")
    .notNull()
    .references(() => person.id),
  toPersonId: uuid("to_person_id")
    .notNull()
    .references(() => person.id),
  type: relationshipTypeEnum("type").notNull(),
  financialScope: boolean("financial_scope").notNull().default(false),
  academicScope: boolean("academic_scope").notNull().default(false),
  consentState: consentStateEnum("consent_state").notNull().default("pending"),
  consentEvidenceRef: text("consent_evidence_ref"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  ...auditColumns,
});

/** Holds / service indicators that gate or enable actions (PeopleSoft idea). */
export const serviceIndicator = pgTable("service_indicator", {
  ...idColumn,
  ...tenantColumn,
  personId: uuid("person_id")
    .notNull()
    .references(() => person.id),
  type: text("type").notNull(),
  polarity: indicatorPolarityEnum("polarity").notNull(),
  reason: text("reason"),
  impact: jsonb("impact").notNull().default({}),
  placedBy: uuid("placed_by"),
  placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
  releasedBy: uuid("released_by"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  ...auditColumns,
});
