import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { prefersReducedMotion } from "./motionPreference";

/**
 * Shared GSAP helpers for Orbit CRM.
 *
 * Rules every animation built on these follows:
 * - transform/opacity only (no layout properties), so nothing shifts;
 * - created inside gsap.context() and reverted on unmount, so no tween
 *   outlives its component and StrictMode's double effect run is harmless;
 * - skipped entirely when prefers-reduced-motion is set;
 * - `clearProps` hands the element back to CSS once the tween ends, so
 *   hover/active styles keep working afterwards;
 * - never gates interaction: elements stay clickable while they fade in.
 */
export { gsap };

export const MOTION = {
  ease: "power3.out",
  fast: 0.25,
  base: 0.45,
} as const;

interface RevealOptions {
  /** CSS selector of the children to animate; omitted = the container itself. */
  selector?: string;
  y?: number;
  duration?: number;
  stagger?: number;
}

/**
 * Fades + lifts a container (or its matching children) in once, on mount.
 * Returns the ref to attach to the container.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>({
  selector,
  y = 14,
  duration = MOTION.base,
  stagger = 0.06,
}: RevealOptions = {}) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const container = ref.current;

    if (!container || prefersReducedMotion()) {
      return undefined;
    }

    const targets = selector
      ? Array.from(container.querySelectorAll<HTMLElement>(selector))
      : [container];

    if (targets.length === 0) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.from(targets, {
        opacity: 0,
        y,
        duration,
        stagger,
        ease: MOTION.ease,
        clearProps: "opacity,transform",
      });
    }, container);

    return () => context.revert();
  }, [selector, y, duration, stagger]);

  return ref;
}
