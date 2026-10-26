import { useLayoutEffect, useRef } from "react";

import { gsap, MOTION } from "../../lib/gsapMotion";
import { prefersReducedMotion } from "../../lib/motionPreference";
import { formatDecimalString } from "../../lib/reportFormat";

interface CountUpProps {
  /**
   * The real value. A decimal STRING is how money and percentages arrive
   * from the backend ("12345.50"); a number is accepted for plain counts.
   * Either way the text shown when the animation ends is produced from the
   * exact original, never from the animated number.
   */
  value: number | string;
  /** Appended after the number, e.g. "%". */
  suffix?: string;
  duration?: number;
  locale?: string;
  className?: string;
}

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Animated count-up for report indicators: 0 -> value, once the value is
 * available (callers mount this only after the data has arrived, so a
 * loading report never shows a fake zero).
 *
 * - One reusable component and one tween per mounted number; no GSAP
 *   scattered through the report cards.
 * - GSAP writes the text straight into the DOM node (no React re-render
 *   per frame), which is why React gets NO children for the span: it never
 *   owns the text node GSAP is updating.
 * - When `value` changes while mounted, it animates from what is currently
 *   shown to the new value instead of restarting from 0.
 * - prefers-reduced-motion (or a value too large to animate without losing
 *   digits) shows the exact final text immediately.
 * - `data-final` + a hidden ::after (see index.css) reserve the final text's
 *   width, so the figure does not jitter or shift the layout while counting.
 */
export default function CountUp({
  value,
  suffix = "",
  duration = 0.9,
  locale,
  className = "",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Last numeric value drawn: the starting point of the next animation.
  const shownRef = useRef(0);

  const exact = typeof value === "number" ? String(value) : value;
  const finalText = `${formatDecimalString(exact, locale)}${suffix}`;

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) {
      return undefined;
    }

    const match = DECIMAL.exec(exact);
    const target = match ? Number(exact) : NaN;
    const animatable =
      match !== null &&
      Number.isFinite(target) &&
      Math.abs(target) <= Number.MAX_SAFE_INTEGER &&
      !prefersReducedMotion();

    if (!animatable) {
      el.textContent = finalText;
      shownRef.current = Number.isFinite(target) ? target : 0;
      return undefined;
    }

    const decimals = match?.[3]?.length ?? 0;
    const format = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const progress = { n: shownRef.current };
    // revert() re-renders the tween at its start and fires onUpdate; once
    // this run is disposed those calls must not overwrite what was shown.
    let disposed = false;

    el.textContent = `${format.format(progress.n)}${suffix}`;

    const context = gsap.context(() => {
      gsap.to(progress, {
        n: target,
        duration,
        ease: MOTION.ease,
        onUpdate: () => {
          if (disposed) return;
          shownRef.current = progress.n;
          el.textContent = `${format.format(progress.n)}${suffix}`;
        },
        onComplete: () => {
          if (disposed) return;
          shownRef.current = target;
          // Exact text from the original string, not from the float.
          el.textContent = finalText;
        },
      });
    });

    return () => {
      disposed = true;
      context.revert();
    };
  }, [exact, finalText, suffix, duration, locale]);

  return (
    <span
      ref={ref}
      data-final={finalText}
      className={`orbit-countup ${className}`.trim()}
    />
  );
}
