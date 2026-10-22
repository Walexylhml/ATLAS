import { pgEnum } from "drizzle-orm/pg-core";

// Platform
export const tenantTypeEnum = pgEnum("tenant_type", [
  "university",
  "polytechnic",
  "college_of_education",
]);
export const tenantStatusEnum = pgEnum("tenant_status", [
  "onboarding",
  "active",
  "suspended",
  "offboarded",
]);
export const platformRoleEnum = pgEnum("platform_role", [
  "super_admin",
  "ops",
  "support",
  "billing",
  "compliance",
  "onboarding",
]);

// Identity
export const personStatusEnum = pgEnum("person_status", ["active", "inactive", "merged"]);
export const accountStatusEnum = pgEnum("account_status", [
  "invited",
  "active",
  "locked",
  "disabled",
]);
export const authMethodEnum = pgEnum("auth_method", ["password", "otp", "password_otp", "sso"]);
export const scopeTypeEnum = pgEnum("scope_type", [
  "tenant",
  "school",
  "faculty",
  "department",
  "programme",
  "self",
]);
export const relationshipTypeEnum = pgEnum("relationship_type", ["parent", "guardian", "sponsor"]);
export const consentStateEnum = pgEnum("consent_state", ["pending", "granted", "revoked"]);
export const indicatorPolarityEnum = pgEnum("indicator_polarity", ["positive", "negative"]);

// Auth
export const otpChannelEnum = pgEnum("otp_channel", ["sms", "email"]);
export const otpPurposeEnum = pgEnum("otp_purpose", ["login", "step_up", "enrol"]);

// Academic
export const semesterOrdinalEnum = pgEnum("semester_ordinal", ["first", "second"]);
export const courseTypeEnum = pgEnum("course_type", [
  "core",
  "required",
  "elective",
  "general_studies",
]);
export const studentStatusEnum = pgEnum("student_status", [
  "active",
  "deferred",
  "withdrawn",
  "graduated",
  "suspended",
]);
export const offeringStatusEnum = pgEnum("offering_status", ["open", "closed"]);
export const registrationStatusEnum = pgEnum("registration_status", [
  "registered",
  "dropped",
  "approved",
]);

// Financials
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "part_paid",
  "paid",
  "void",
]);
export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "charge",
  "payment",
  "adjustment",
  "reversal",
  "waiver",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "successful",
  "failed",
  "reversed",
]);
export const paymentProviderEnum = pgEnum("payment_provider", ["flutterwave", "manual"]);

// Holds (negative service indicators)
export const holdTypeEnum = pgEnum("hold_type", [
  "financial",
  "library",
  "disciplinary",
  "medical",
  "academic",
  "documents",
  "other",
]);
export const holdStatusEnum = pgEnum("hold_status", ["active", "lifted"]);

// Cross-cutting
export const actorTypeEnum = pgEnum("actor_type", ["platform", "user", "system"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "dispatched", "failed"]);
export const documentSensitivityEnum = pgEnum("document_sensitivity", [
  "public",
  "internal",
  "confidential",
  "restricted",
]);
