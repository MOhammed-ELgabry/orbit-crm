/**
 * Single source of truth for "should this animate?".
 *
 * Returns true (do NOT animate) when the user asked the OS for reduced
 * motion, and also when the environment cannot report a preference at all
 * (no window / no matchMedia, e.g. a test renderer): animating on an
 * unknown preference is the unsafe default, showing the final state is not.
 */
export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
