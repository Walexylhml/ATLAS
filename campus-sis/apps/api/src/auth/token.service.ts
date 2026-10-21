import { Injectable } from "@nestjs/common";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { loadEnv } from "../config/env.js";

/**
 * Stateless access tokens (HS256 JWT) + opaque refresh tokens.
 *
 * We deliberately do NOT pull in a JWT library: HS256 is an HMAC over two
 * base64url segments, which node:crypto does natively. Fewer dependencies to
 * audit on a two-person team, and nothing here is clever enough to get wrong
 * that a test won't catch. If we ever need asymmetric keys (RS/ES) for SSO,
 * that is the moment to adopt a library — recorded as a follow-up, not now.
 */

export interface AccessTokenClaims {
  /** user_account id */
  sub: string;
  /** tenant id */
  tid: string;
  /** person id */
  pid: string;
  /** auth_session id */
  sid: string;
  /** assurance level: 'otp' | 'step_up' | 'sso' */
  aas: string;
}

interface SignedClaims extends AccessTokenClaims {
  iat: number;
  exp: number;
  iss: string;
  typ: "access";
}

const ISSUER = "atlas";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

@Injectable()
export class TokenService {
  private readonly env = loadEnv();

  /** Sign a short-lived access token. Returns the compact JWT string. */
  issueAccessToken(claims: AccessTokenClaims): { token: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.env.ACCESS_TOKEN_TTL_SECONDS;
    const payload: SignedClaims = {
      ...claims,
      iss: ISSUER,
      typ: "access",
      iat: now,
      exp: now + expiresIn,
    };
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(payload));
    const signingInput = `${header}.${body}`;
    const signature = this.sign(signingInput);
    return { token: `${signingInput}.${signature}`, expiresIn };
  }

  /**
   * Verify signature, issuer, type and expiry. Returns the claims on success or
   * null on any failure — callers turn null into 401. Never throws on malformed
   * input, so a garbage Authorization header can't 500 the process.
   */
  verifyAccessToken(token: string): AccessTokenClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts as [string, string, string];
    const expected = this.sign(`${header}.${body}`);
    if (!this.safeEqual(signature, expected)) return null;

    let payload: SignedClaims;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (payload.iss !== ISSUER || payload.typ !== "access") return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const { sub, tid, pid, sid, aas } = payload;
    if (!sub || !tid || !pid || !sid || !aas) return null;
    return { sub, tid, pid, sid, aas };
  }

  /** A fresh opaque refresh token (returned to the client once) + its stored hash. */
  issueRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashRefreshToken(token) };
  }

  /** Deterministic hash of a refresh token for DB lookup. Plaintext is never stored. */
  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private sign(input: string): string {
    return createHmac("sha256", this.env.JWT_SECRET).update(input).digest("base64url");
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}
