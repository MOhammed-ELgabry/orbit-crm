/**
 * Decodes (without verifying) the payload of a JWT for display purposes
 * only — e.g. showing "logged in as X" in the UI. This must never be used
 * as a substitute for real authorization: every protected API call is
 * still authorized server-side by JwtAuthGuard verifying the token's
 * signature. This function only reads a claim that's already public
 * information the moment the browser possesses the token.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(
  token: string,
): T | null {
  try {
    const [, payloadSegment] = token.split(".");

    if (!payloadSegment) {
      return null;
    }

    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );

    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );

    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}