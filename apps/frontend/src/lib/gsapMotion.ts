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

interface RopeDropOptions {
  /** How far above its resting place the element starts, in px. */
  distance?: number;
  /** Starting tilt in degrees; the element swings back to 0. */
  swing?: number;
  /** Distance of the invisible anchor point above the element, in px. */
  anchor?: number;
}

/**
 * Lowers an element into place as if it hung from an invisible rope: it
 * drops in from above, overshoots its resting spot a touch while the rope
 * stretches, then settles while a small pendulum swing dies out (the swing
 * pivots around a point above the element, which is what makes it read as
 * "hung"). transform/opacity only, so nothing around it moves.
 *
 * Skipped for reduced motion (the element is simply there). Built inside
 * gsap.context() and reverted on unmount, so a navigation mid-drop leaves no
 * tween behind; once it finishes, inline styles are cleared so CSS hover and
 * focus styles apply normally. It never blocks clicks or typing.
 */
export function useRopeDrop<T extends HTMLElement = HTMLDivElement>({
  distance = 170,
  swing = 2.4,
  anchor = 90,
}: RopeDropOptions = {}) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || prefersReducedMotion()) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.set(element, { transformOrigin: `50% -${anchor}px` });

      const timeline = gsap.timeline({
        onComplete: () => {
          gsap.set(element, {
            clearProps: "transform,opacity,transformOrigin",
          });
        },
      });

      timeline
        .fromTo(
          element,
          { y: -distance },
          { y: 0, duration: 0.85, ease: "back.out(1.3)" },
          0,
        )
        .fromTo(
          element,
          { opacity: 0 },
          { opacity: 1, duration: 0.35, ease: "power1.out" },
          0,
        )
        .fromTo(
          element,
          { rotation: swing },
          { rotation: 0, duration: 1.5, ease: "elastic.out(1, 0.32)" },
          0.2,
        );
    }, element);

    return () => context.revert();
  }, [distance, swing, anchor]);

  return ref;
}
