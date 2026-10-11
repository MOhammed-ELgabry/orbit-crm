/**
 * Display helpers for report values. Money and percentages arrive from the
 * backend as exact decimal STRINGS; these helpers format them by string
 * manipulation and BigInt, never by converting the whole value to a JS
 * number, so cents on large sums are never lost.
 */

const DECIMAL_STRING = /^(-?)(\d+)(?:\.(\d+))?$/;

/** The locale's decimal separator ("." or ","/"٫"). */
function decimalSeparator(locale?: string): string {
  const part = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find((p) => p.type === "decimal");

  return part?.value ?? ".";
}

/**
 * Formats a decimal string with locale digit grouping, keeping every
 * fractional digit it was given. "10000002124.06" -> "10,000,002,124.06"
 * (en). Anything that isn't a plain decimal string is returned unchanged
 * rather than guessed at.
 */
export function formatDecimalString(value: string, locale?: string): string {
  const match = DECIMAL_STRING.exec(value);

  if (!match) {
    return value;
  }

  const [, sign, integer, fraction] = match;
  const grouped = new Intl.NumberFormat(locale, {
    useGrouping: true,
  }).format(BigInt(integer));

  return `${sign}${grouped}${fraction ? decimalSeparator(locale) + fraction : ""}`;
}

/** "50.00" -> "50.00%"; null -> the placeholder (a null rate means "not computable", never 0%). */
export function formatPercentString(
  value: string | null,
  placeholder = "—",
  locale?: string,
): string {
  return value === null
    ? placeholder
    : `${formatDecimalString(value, locale)}%`;
}

/**
 * Chart geometry only: a bar's height may use a JS number, but the label
 * next to it always shows the exact string via formatDecimalString.
 */
export function toChartNumber(value: string): number {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}
