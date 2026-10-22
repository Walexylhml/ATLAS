import { blockingHolds, deriveFinancialHold, type EffectiveHold } from "./holds.service.js";

describe("holds — financial derivation", () => {
  it("raises a financial hold when balance exceeds the threshold", () => {
    const h = deriveFinancialHold(152_000, 0);
    expect(h).not.toBeNull();
    expect(h!.type).toBe("financial");
    expect(h!.auto).toBe(true);
    expect(h!.blocksRegistration).toBe(true);
    expect(h!.balanceMinor).toBe(152_000);
  });

  it("does not raise one when balance is at or below the threshold", () => {
    expect(deriveFinancialHold(0, 0)).toBeNull();
    expect(deriveFinancialHold(50_000, 50_000)).toBeNull();
    // A tenant that allows registration with up to ₦50,000 outstanding.
    expect(deriveFinancialHold(50_000, 5_000_000)).toBeNull();
  });

  it("raises one above a non-zero threshold", () => {
    expect(deriveFinancialHold(5_000_001, 5_000_000)).not.toBeNull();
  });
});

describe("holds — blocking filter", () => {
  const holds: EffectiveHold[] = [
    { type: "financial", reason: "owes", blocksRegistration: true, auto: true },
    { type: "documents", reason: "transcript pending", blocksRegistration: false, auto: false },
    { type: "disciplinary", reason: "panel", blocksRegistration: true, auto: false },
  ];

  it("keeps only holds that block registration", () => {
    const blocking = blockingHolds(holds);
    expect(blocking).toHaveLength(2);
    expect(blocking.map((h) => h.type).sort()).toEqual(["disciplinary", "financial"]);
  });

  it("returns none when every hold is informational", () => {
    expect(blockingHolds([{ type: "library", reason: "x", blocksRegistration: false, auto: false }]))
      .toHaveLength(0);
  });
});
