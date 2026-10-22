import { FlutterwaveAdapter } from "./flutterwave.adapter.js";

// Configure a webhook secret before the adapter reads env (loadEnv caches per
// test-file module registry, so this is picked up at construction).
process.env.FLW_WEBHOOK_SECRET_HASH = "test-secret-hash";

describe("FlutterwaveAdapter", () => {
  const adapter = new FlutterwaveAdapter();

  it("verifies the webhook hash constant-time", () => {
    expect(adapter.verifyWebhook("test-secret-hash")).toBe(true);
    expect(adapter.verifyWebhook("wrong-hash")).toBe(false);
    expect(adapter.verifyWebhook(undefined)).toBe(false);
  });

  it("parses a Flutterwave event, converting naira to kobo", () => {
    const e = adapter.parseEvent({
      event: "charge.completed",
      data: { tx_ref: "ATLAS-abc", status: "successful", amount: 1520, currency: "NGN" },
    });
    expect(e.providerRef).toBe("ATLAS-abc");
    expect(e.status).toBe("successful");
    expect(e.amountMinor).toBe(152000);
  });

  it("rounds fractional naira to the kobo and tolerates missing fields", () => {
    expect(adapter.parseEvent({ data: { amount: 1500.5 } }).amountMinor).toBe(150050);
    expect(adapter.parseEvent({}).amountMinor).toBe(0);
    expect(adapter.parseEvent({}).providerRef).toBeUndefined();
  });

  it("returns an offline stub link outside production (no network)", async () => {
    const r = await adapter.initiate({ ref: "ATLAS-xyz", amountMajor: 100, currency: "NGN" });
    expect(r.stub).toBe(true);
    expect(r.link).toContain("ATLAS-xyz");
  });
});
