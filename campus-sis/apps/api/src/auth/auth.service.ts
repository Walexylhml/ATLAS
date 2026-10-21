import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { loadEnv } from "../config/env.js";
import { withTenant, type TxDb } from "../database/rls.js";
import {
  authSession,
  eventOutbox,
  otpChallenge,
  userAccount,
} from "../database/schema/index.js";
import { OtpService } from "./otp.service.js";
import { TokenService } from "./token.service.js";

export interface TokenPair {
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const LOGINABLE = new Set(["invited", "active"]);

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Issue an OTP to the identifier (phone or email) within the given tenant.
   * Returns a generic acknowledgement regardless of whether the account exists,
   * so the endpoint can't be used to enumerate accounts. In development only,
   * the code is echoed back so there's no SMS dependency to test the flow.
   */
  async requestOtp(
    tenantId: string,
    identifier: string,
    channel: "sms" | "email",
    purpose: "login" | "step_up" | "enrol",
  ): Promise<{ status: "sent"; devCode?: string }> {
    const dest = normalise(identifier);
    const devCode = await withTenant({ tenantId }, async (db) => {
      const [account] = await db
        .select({ id: userAccount.id })
        .from(userAccount)
        .where(
          and(
            eq(userAccount.tenantId, tenantId),
            or(eq(userAccount.phone, dest), eq(userAccount.email, dest)),
            isNull(userAccount.deletedAt),
          ),
        )
        .limit(1);

      if (!account) {
        // No account: do nothing, but the caller still gets 'sent'.
        return undefined;
      }

      const challengeId = newId();
      const code = this.otp.generateCode();
      const expiresAt = new Date(Date.now() + this.otp.ttlSeconds * 1000);

      await db.insert(otpChallenge).values({
        id: challengeId,
        tenantId,
        userAccountId: account.id,
        channel,
        destination: dest,
        codeHash: this.otp.hashCode(code, challengeId),
        purpose,
        maxAttempts: this.otp.maxAttempts,
        expiresAt,
      });

      // Transactional outbox: the SMS/email actually gets sent by the dispatcher,
      // in the same transaction as the challenge — a crash can't drop the code
      // silently or send one for a challenge that rolled back.
      await db.insert(eventOutbox).values({
        id: newId(),
        tenantId,
        aggregateType: "otp_challenge",
        aggregateId: challengeId,
        eventType: "otp.requested",
        payload: { channel, destination: dest, purpose },
      });

      return code;
    });

    return this.env.NODE_ENV === "development" && devCode
      ? { status: "sent", devCode }
      : { status: "sent" };
  }

  /**
   * Verify a presented code and, on success, open a session: a stateless access
   * token plus a DB-backed, rotating refresh token.
   */
  async verifyOtp(
    tenantId: string,
    identifier: string,
    code: string,
    purpose: "login" | "step_up" | "enrol",
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const dest = normalise(identifier);
    return withTenant({ tenantId }, async (db) => {
      const [challenge] = await db
        .select()
        .from(otpChallenge)
        .where(
          and(
            eq(otpChallenge.tenantId, tenantId),
            eq(otpChallenge.destination, dest),
            eq(otpChallenge.purpose, purpose),
            isNull(otpChallenge.consumedAt),
            gt(otpChallenge.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(otpChallenge.createdAt))
        .limit(1);

      if (!challenge) throw new UnauthorizedException("Invalid or expired code");
      if (challenge.attempts >= challenge.maxAttempts) {
        await db
          .update(otpChallenge)
          .set({ consumedAt: new Date() })
          .where(eq(otpChallenge.id, challenge.id));
        throw new UnauthorizedException("Too many attempts");
      }

      const ok = this.otp.verifyCode(code, challenge.id, challenge.codeHash);
      if (!ok) {
        const attempts = challenge.attempts + 1;
        await db
          .update(otpChallenge)
          .set({
            attempts,
            // Burn the challenge once the attempt budget is spent.
            consumedAt: attempts >= challenge.maxAttempts ? new Date() : null,
          })
          .where(eq(otpChallenge.id, challenge.id));
        throw new UnauthorizedException("Invalid or expired code");
      }

      // Correct code — consume the challenge so it can't be replayed.
      await db
        .update(otpChallenge)
        .set({ consumedAt: new Date() })
        .where(eq(otpChallenge.id, challenge.id));

      if (!challenge.userAccountId) throw new UnauthorizedException("Invalid or expired code");
      const [account] = await db
        .select()
        .from(userAccount)
        .where(and(eq(userAccount.id, challenge.userAccountId), isNull(userAccount.deletedAt)))
        .limit(1);
      if (!account || !LOGINABLE.has(account.status)) {
        throw new UnauthorizedException("Account is not permitted to sign in");
      }

      // First successful login activates an invited account.
      await db
        .update(userAccount)
        .set({
          status: "active",
          lastLoginAt: new Date(),
          updatedAt: new Date(),
          updatedBy: account.id,
        })
        .where(eq(userAccount.id, account.id));

      const tokens = await this.openSession(db, {
        tenantId,
        accountId: account.id,
        personId: account.personId,
        assurance: purpose === "step_up" ? "step_up" : "otp",
        meta,
      });
      this.log.log(`login ok account=${account.id} tenant=${tenantId}`);
      return tokens;
    });
  }

  /**
   * Exchange a valid refresh token for a new access token, rotating the refresh
   * token (the presented one is revoked and replaced). A revoked or expired
   * token is rejected — the client must re-authenticate.
   */
  async refresh(tenantId: string, refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const hash = this.tokens.hashRefreshToken(refreshToken);
    return withTenant({ tenantId }, async (db) => {
      const [session] = await db
        .select()
        .from(authSession)
        .where(
          and(
            eq(authSession.tenantId, tenantId),
            eq(authSession.refreshTokenHash, hash),
            isNull(authSession.revokedAt),
            gt(authSession.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!session) throw new UnauthorizedException("Invalid or expired session");

      // Rotate: revoke the old session row, open a fresh one.
      await db
        .update(authSession)
        .set({ revokedAt: new Date() })
        .where(eq(authSession.id, session.id));

      return this.openSession(db, {
        tenantId,
        accountId: session.userAccountId,
        // personId isn't on the session row; look it up once.
        personId: await this.personIdFor(db, session.userAccountId),
        assurance: session.assuranceLevel,
        meta,
      });
    });
  }

  /** Revoke a single session (logout). Idempotent. */
  async logout(tenantId: string, sessionId: string): Promise<void> {
    await withTenant({ tenantId }, async (db) => {
      await db
        .update(authSession)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSession.tenantId, tenantId), eq(authSession.id, sessionId)));
    });
  }

  // --- internals ---

  private async openSession(
    db: TxDb,
    args: {
      tenantId: string;
      accountId: string;
      personId: string;
      assurance: string;
      meta: RequestMeta;
    },
  ): Promise<TokenPair> {
    const sessionId = newId();
    const refresh = this.tokens.issueRefreshToken();
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await db.insert(authSession).values({
      id: sessionId,
      tenantId: args.tenantId,
      userAccountId: args.accountId,
      refreshTokenHash: refresh.hash,
      assuranceLevel: args.assurance,
      ip: args.meta.ip ?? null,
      userAgent: args.meta.userAgent ?? null,
      expiresAt,
    });

    const access = this.tokens.issueAccessToken({
      sub: args.accountId,
      tid: args.tenantId,
      pid: args.personId,
      sid: sessionId,
      aas: args.assurance,
    });

    return {
      tokenType: "Bearer",
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: access.expiresIn,
    };
  }

  private async personIdFor(db: TxDb, accountId: string): Promise<string> {
    const [row] = await db
      .select({ personId: userAccount.personId })
      .from(userAccount)
      .where(eq(userAccount.id, accountId))
      .limit(1);
    if (!row) throw new UnauthorizedException("Account no longer exists");
    return row.personId;
  }
}

/** Lower-case + trim; phone normalisation beyond this lands with the SMS adapter. */
function normalise(identifier: string): string {
  return identifier.trim().toLowerCase();
}
