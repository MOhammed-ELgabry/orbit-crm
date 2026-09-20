/**
 * WCAG-based background → foreground contrast calculation.
 *
 * Settings → Appearance only lets the user pick a background color; the
 * matching foreground/text color is always derived from it here, never
 * chosen by the user and never persisted (see UpdateUserAppearanceDto on
 * the backend for why: a stored foreground could drift out of sync with
 * its background, this can't). Deterministic — the same backgroundColor
 * always produces the same foreground, so the local live preview (before
 * Save) and the value re-applied after loading from the backend can
 * never visually disagree.
 *
 * Approach: compute the WCAG relative luminance of the background, then
 * pick whichever of pure white or pure black yields the higher contrast
 * ratio against it. White and black are the two extremes of the
 * luminance range, so this always favors whichever side clears more of
 * the available contrast for that particular background.
 */

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");

  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);

  return [r, g, b];
}

function channelToLinear(channel: number): number {
  const c = channel / 255;

  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const [rLinear, gLinear, bLinear] = [r, g, b].map(channelToLinear);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

export const WHITE_FOREGROUND = "#FFFFFF";
export const BLACK_FOREGROUND = "#000000";

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Returns WHITE_FOREGROUND or BLACK_FOREGROUND — whichever gives better
 * contrast against backgroundColor. Falls back to BLACK_FOREGROUND for a
 * malformed input (e.g. mid-typing in the hex text field) rather than
 * throwing, since this also drives the live preview on every keystroke.
 */
export function getForegroundColor(backgroundColor: string): string {
  if (!HEX_COLOR_PATTERN.test(backgroundColor)) {
    return BLACK_FOREGROUND;
  }

  const backgroundLuminance = relativeLuminance(backgroundColor);
  const contrastWithWhite = contrastRatio(backgroundLuminance, 1);
  const contrastWithBlack = contrastRatio(backgroundLuminance, 0);

  return contrastWithWhite >= contrastWithBlack
    ? WHITE_FOREGROUND
    : BLACK_FOREGROUND;
}
