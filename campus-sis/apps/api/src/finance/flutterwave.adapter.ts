import { Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { loadEnv } from "../config/env.js";

/** Normalised gateway event, provider-agnostic, for reconciliation. */
export interface GatewayEvent {
  providerRef?: string;
  /** provider status string, normalised: 'successful' | 'failed' | other */
  status: string;
  amountMinor: number;
  raw: unknown;
}

/**
 * Flutterwave adapter (ADR-0004). Deliberately thin and side-effect-light: a
 * real payment-initiation HTTP call only happens in production with a configured
 * key — in dev/test it returns a deterministic stub link and touches no network,
 * so the whole flow (initiate → webhook → reconcile) is testable offline. Webhook
 * authenticity is Flutterwave's static `verif-hash` header compared constant-time.
 */
@Injectable()
export class FlutterwaveAdapter {
  private readonly env = loadEnv();

  async initiate(args: {
    ref: string;
    amountMajor: number;
    currency: string;
    email?: string;
    name?: string;
    redirectUrl?: string;
  }): Promise<{ link: string; provider: "flutterwave"; stub: boolean }> {
    if (this.env.NODE_ENV === "production" && this.env.FLW_SECRET_KEY) {
      const res = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.env.FLW_SECRET_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: args.ref,
          amount: args.amountMajor,
          currency: args.currency,
          redirect_url: args.redirectUrl,
          customer: { email: args.email, name: args.name },
        }),
      });
      const json = (await res.json()) as { data?: { link?: string } };
      const link = json?.data?.link;
      if (!link) throw new Error("Flutterwave did not return a payment link");
      return { link, provider: "flutterwave", stub: false };
    }
    // Dev/test: no network, deterministic link.
    return {
      link: `https://checkout.dev.atlas.local/pay/${encodeURIComponent(args.ref)}`,
      provider: "flutterwave",
      stub: true,
    };
  }

  /** Verify the webhook's static secret-hash header, constant-time. */
  verifyWebhook(headerHash?: string): boolean {
    const expected = this.env.FLW_WEBHOOK_SECRET_HASH;
    // No hash configured: accept only outside production (dev convenience).
    if (!expected) return this.env.NODE_ENV !== "production";
    if (!headerHash) return false;
    const a = Buffer.from(headerHash);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Normalise a Flutterwave webhook payload into a GatewayEvent. */
  parseEvent(payload: unknown): GatewayEvent {
    const p = (payload ?? {}) as { data?: Record<string, unknown> };
    const d = p.data ?? {};
    return {
      providerRef: typeof d.tx_ref === "string" ? d.tx_ref : undefined,
      status: typeof d.status === "string" ? d.status : "unknown",
      amountMinor: Math.round(Number(d.amount ?? 0) * 100),
      raw: payload,
    };
  }
}
