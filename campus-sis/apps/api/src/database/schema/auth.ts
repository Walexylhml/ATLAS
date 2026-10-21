import { inet, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, tenantColumn } from "./_shared.js";
import { otpChannelEnum, otpPurposeEnum } from "./enums.js";
import { userAccount } from "./identity.js";

/**
 * AUTH domain — the moving parts of a login, kept out of IDENTITY (which is the
 * durable record of a human). OTP challenges and sessions are short-lived,
 * high-churn, and tenant-scoped; both live under RLS like any tenant data.
 */

/**
 * A one-time-code challenge. Phone-first (SMS) given the market, email as
 * fallback. The plaintext code is NEVER stored — only an HMAC of it (see
 * OtpService). Rows are consumed on success or lockout and swept after expiry.
 */
export const otpChallenge = pgTable("otp_challenge", {
  ...idColumn,
  ...tenantColumn,
  // Nullable: we still record a challenge shape even when the destination maps
  // to no account, so request timing doesn't leak account existence.
  userAccountId: uuid("user_account_id").references(() => userAccount.id),
  channel: otpChannelEnum("channel").notNull(),
  // The phone/email the code was sent to (normalised).
  destination: text("destination").notNull(),
  // HMAC-SHA256 of the code, salted per-challenge. Opaque; never reversible.
  codeHash: text("code_hash").notNull(),
  purpose: otpPurposeEnum("purpose").notNull().default("login"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An authenticated session. The access token is stateless (signed JWT); this
 * row backs the long-lived refresh token (only its hash is stored) and makes
 * every session individually revocable — a hard requirement from the RBAC spec
 * ("all sessions revocable"). Refresh tokens rotate on use.
 */
export const authSession = pgTable("auth_session", {
  ...idColumn,
  ...tenantColumn,
  userAccountId: uuid("user_account_id")
    .notNull()
    .references(() => userAccount.id),
  // SHA-256 of the opaque refresh token. Unique so a stolen-hash collision or
  // double-insert is impossible.
  refreshTokenHash: text("refresh_token_hash").notNull().unique(),
  // How strongly this session is authenticated: 'otp' | 'step_up' | 'sso'.
  // Sensitive permissions can demand 'step_up' (re-auth) — see AuthzService.
  assuranceLevel: text("assurance_level").notNull().default("otp"),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
