// Amounts are plain numbers in euros. Any sum or subtraction goes through
// integer cents, so 0.1 + 0.2 is exactly 0.3.

export function toCents(amount) {
  return Math.round(amount * 100);
}

export function fromCents(cents) {
  return cents / 100;
}

// Reads an amount typed by the user in Spanish style: "1.250,50", "1250,5",
// "-20", "12 €". A dot followed by groups of exactly three digits is a
// thousands separator ("12.500" is 12500); any other dot is a decimal point
// ("12.5"). Returns null when the text is not a number. Decimals are not
// limited here: validation decides.
export function parseAmountInput(text) {
  let value = String(text ?? '').replace(/[\s €]/g, '');
  let sign = 1;
  if (/^[-−]/.test(value)) {
    sign = -1;
    value = value.slice(1);
  }
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  return sign * Number(value);
}

export function hasAtMostTwoDecimals(amount) {
  if (!Number.isFinite(amount)) return false;
  const scaled = amount * 100;
  // Tolerance absorbs float noise (0.29 * 100 = 28.999999999999996).
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}
