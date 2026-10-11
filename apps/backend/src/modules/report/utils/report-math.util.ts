/**
 * Integer-only percentage: round-half-up of numerator / denominator * 100
 * to 2 decimal places, as a string ("66.67"). Returns null when the
 * denominator is 0 (there is nothing to divide by — "0%" would be a lie).
 *
 * Done on integers so the result is exact and never depends on binary
 * floating-point rounding.
 */
export function percentString(
  numerator: number,
  denominator: number,
): string | null {
  if (denominator <= 0) {
    return null;
  }

  // basis points, rounded half up: (n * 10000 + d / 2) / d, integer division
  const basisPoints = Math.floor(
    (numerator * 10_000 * 2 + denominator) / (denominator * 2),
  );

  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, '0');

  return `${whole}.${fraction}`;
}
