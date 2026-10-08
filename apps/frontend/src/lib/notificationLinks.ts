/**
 * The backend only ever sends in-app paths ("/dashboard/..."), but the
 * client re-validates before navigating: a poisoned row or payload must
 * never become an open redirect or a `javascript:` link.
 */
export function safeDashboardPath(
  path: string | null | undefined,
): string | null {
  if (typeof path !== "string") return null;

  if (!path.startsWith("/dashboard")) return null;
  // "//host" (protocol-relative), backslashes and any scheme are rejected.
  if (path.startsWith("//") || path.includes("\\") || path.includes(":")) {
    return null;
  }
  // Only the "/dashboard" segment itself or a sub-path.
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return null;

  return path;
}