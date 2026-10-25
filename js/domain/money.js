// Amounts are plain numbers in euros. Any sum or subtraction goes through
// integer cents, so 0.1 + 0.2 is exactly 0.3.

export function toCents(amount) {
  return Math.round(amount * 100);
}

export function fromCents(cents) {
  return cents / 100;
}

export function hasAtMostTwoDecimals(amount) {
  if (!Number.isFinite(amount)) return false;
  const scaled = amount * 100;
  // Tolerance absorbs float noise (0.29 * 100 = 28.999999999999996).
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}
