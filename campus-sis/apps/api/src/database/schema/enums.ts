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

// Cross-cutting
export const actorTypeEnum = pgEnum("actor_type", ["platform", "user", "system"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "dispatched", "failed"]);
export const documentSensitivityEnum = pgEnum("document_sensitivity", [
  "public",
  "internal",
  "confidential",
  "restricted",
]);
