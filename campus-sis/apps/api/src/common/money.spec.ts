import { add, fromMajor, format, money, subtract } from "./money.js";

describe("money (integer minor units)", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(10.5)).toThrow(/integer minor units/);
  });

  it("converts major units to minor, rounding to the kobo", () => {
    expect(fromMajor(1500).amountMinor).toBe(150000);
    expect(fromMajor(1500.5).amountMinor).toBe(150050);
    expect(fromMajor(0.1 + 0.2).amountMinor).toBe(30); // no float drift at the boundary
  });

  it("adds and subtracts within a currency", () => {
    expect(add(money(150000), money(50000)).amountMinor).toBe(200000);
    expect(subtract(money(150000), money(50000)).amountMinor).toBe(100000);
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(100, "NGN"), money(100, "USD"))).toThrow(/Currency mismatch/);
  });

  it("formats NGN with the naira symbol and two decimals", () => {
    expect(format(money(150000))).toBe("₦1,500.00");
  });
});
