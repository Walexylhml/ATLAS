import {
  bucketFor,
  daysOverdue,
  rollupAging,
  summarizeInvoices,
  type AgingItem,
} from "./reporting.service.js";

describe("reporting — aging day math", () => {
  const asOf = new Date("2026-10-22T00:00:00Z");

  it("counts whole days overdue, negative before the due date", () => {
    expect(daysOverdue(new Date("2026-10-12T00:00:00Z"), asOf)).toBe(10);
    expect(daysOverdue(new Date("2026-10-22T00:00:00Z"), asOf)).toBe(0);
    expect(daysOverdue(new Date("2026-11-01T00:00:00Z"), asOf)).toBe(-10);
  });

  it("maps day counts to the right bucket", () => {
    expect(bucketFor(-5)).toBe("not_due");
    expect(bucketFor(0)).toBe("not_due");
    expect(bucketFor(1)).toBe("d1_30");
    expect(bucketFor(30)).toBe("d1_30");
    expect(bucketFor(31)).toBe("d31_60");
    expect(bucketFor(90)).toBe("d61_90");
    expect(bucketFor(91)).toBe("d90_plus");
    expect(bucketFor(400)).toBe("d90_plus");
  });
});

describe("reporting — aging rollup", () => {
  it("sums counts and amounts per bucket and overall", () => {
    const items: AgingItem[] = [
      { days: -3, balanceMinor: 100 },
      { days: 10, balanceMinor: 200 },
      { days: 20, balanceMinor: 50 },
      { days: 120, balanceMinor: 1000 },
    ];
    const r = rollupAging(items);
    expect(r.totalOutstandingMinor).toBe(1350);
    const byKey = Object.fromEntries(r.buckets.map((b) => [b.key, b]));
    expect(byKey.not_due).toMatchObject({ count: 1, amountMinor: 100 });
    expect(byKey.d1_30).toMatchObject({ count: 2, amountMinor: 250 });
    expect(byKey.d90_plus).toMatchObject({ count: 1, amountMinor: 1000 });
    expect(byKey.d31_60).toMatchObject({ count: 0, amountMinor: 0 });
  });
});

describe("reporting — collections summary", () => {
  it("derives billed/collected/outstanding and a collection rate", () => {
    const s = summarizeInvoices([
      { totalMinor: 15_200_000, balanceMinor: 0, status: "paid" },
      { totalMinor: 15_200_000, balanceMinor: 5_200_000, status: "part_paid" },
      { totalMinor: 10_000_000, balanceMinor: 10_000_000, status: "issued" },
    ]);
    expect(s.billedMinor).toBe(40_400_000);
    expect(s.outstandingMinor).toBe(15_200_000);
    expect(s.collectedMinor).toBe(25_200_000);
    expect(s.collectionRatePct).toBeCloseTo(62.38, 1);
    expect(s.byStatus).toEqual({ paid: 1, part_paid: 1, issued: 1 });
  });

  it("reports a 0% rate when nothing is billed", () => {
    expect(summarizeInvoices([]).collectionRatePct).toBe(0);
  });
});
