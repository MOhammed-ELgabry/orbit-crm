/**
 * Money input handling. Money is NEVER a JS float on the server:
 *  - storage is Decimal(19,4): at most 15 integer digits and 4 fractional digits;
 *  - input is accepted as a decimal string (preferred) or as a JSON number
 *    whose plain decimal form fits the same limits;
 *  - the value is kept as a string all the way to Prisma.Decimal.
 */

export const MONEY_MAX_INTEGER_DIGITS = 15;
export const MONEY_STORAGE_SCALE = 4;

const MONEY_PATTERN = /^\d{1,15}(?:\.\d{1,4})?$/;

/**
 * Returns the canonical decimal string for a valid, non-negative amount, or
 * null. Rejects exponents ("1e3"), signs, separators, NaN/Infinity and
 * anything beyond 15 integer / 4 fractional digits — it never rounds.
 */
export function normalizeMoneyInput(value: unknown): string | null {
  let text: string;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value); // 1e21 -> "1e+21", fails the pattern below
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }

  return MONEY_PATTERN.test(text) ? text : null;
}

/** Number of fractional digits actually carrying a value ("12.3400" -> 2). */
export function significantDecimalPlaces(amount: string): number {
  const dot = amount.indexOf('.');
  if (dot === -1) return 0;
  const fraction = amount.slice(dot + 1).replace(/0+$/, '');
  return fraction.length;
}
