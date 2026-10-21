import { Injectable } from "@nestjs/common";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { loadEnv } from "../config/env.js";

/**
 * One-time codes. The plaintext code leaves this service exactly once (to be
 * sent over SMS/email) and is NEVER persisted — we store only an HMAC, salted
 * with the challenge id so two identical codes in different challenges hash
 * differently and a dumped table reveals nothing. Verification is constant-time.
 */
@Injectable()
export class OtpService {
  private readonly env = loadEnv();

  /** A numeric code of the configured length, uniformly random (crypto, not Math.random). */
  generateCode(): string {
    const len = this.env.OTP_LENGTH;
    const max = 10 ** len;
    // randomInt is unbiased over [0, max); pad so leading zeros survive.
    return randomInt(0, max).toString().padStart(len, "0");
  }

  /** HMAC of the code, bound to the challenge id so it is not portable across challenges. */
  hashCode(code: string, challengeId: string): string {
    return createHmac("sha256", this.env.JWT_SECRET)
      .update(`${challengeId}:${code}`)
      .digest("hex");
  }

  /** Constant-time comparison of a presented code against a stored hash. */
  verifyCode(code: string, challengeId: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashCode(code, challengeId));
    const stored = Buffer.from(storedHash);
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  }

  /** Seconds a freshly-issued code remains valid. */
  get ttlSeconds(): number {
    return this.env.OTP_TTL_SECONDS;
  }

  get maxAttempts(): number {
    return this.env.OTP_MAX_ATTEMPTS;
  }
}
