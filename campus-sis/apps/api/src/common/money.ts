/**
 * Money is stored as integer MINOR units (kobo for NGN) + an ISO-4217 currency.
 * Never floats — see data-model principle #10. These helpers keep that discipline
 * in one place so no caller ever multiplies a naira amount by 100 by hand.
 */
export type Currency = "NGN" | "USD" | "GHS" | "KES";

export interface Money {
  /** integer minor units, e.g. 150000 = ₦1,500.00 */
  readonly amountMinor: number;
  readonly currency: Currency;
}

export function money(amountMinor: number, currency: Currency = "NGN"): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money amount must be integer minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

/** Build Money from a major-unit decimal (e.g. 1500.5 naira). Rounds to the minor unit. */
export function fromMajor(amountMajor: number, currency: Currency = "NGN"): Money {
  return money(Math.round(amountMajor * 100), currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0;
}

export function format(a: Money): string {
  const symbol = a.currency === "NGN" ? "₦" : `${a.currency} `;
  const major = (a.amountMinor / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${major}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
