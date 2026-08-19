import type { Variants } from "framer-motion";

/**
 * Shared Framer Motion presets for Orbit CRM.
 *
 * Kept deliberately restrained: short durations, small offsets, no
 * bounce or scale drama — motion should support the interface, not
 * compete with it.
 *
 * Pass `reduced` (the value of Framer Motion's `useReducedMotion()`
 * hook) to collapse a preset down to an instant, opacity-only
 * transition for people who prefer reduced motion.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export function fadeSlide(
  direction: "left" | "right" | "up" | "none" = "up",
  reduced = false,
): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.15 } },
    };
  }

  const offset = 24;
  const axis =
    direction === "left"
      ? { x: -offset }
      : direction === "right"
        ? { x: offset }
        : direction === "up"
          ? { y: offset }
          : {};

  return {
    hidden: { opacity: 0, ...axis },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: 0.4, ease: EASE },
    },
  };
}

export function staggerContainer(
  reduced = false,
  staggerChildren = 0.06,
): Variants {
  return {
    hidden: {},
    visible: {
      transition: reduced ? {} : { staggerChildren, delayChildren: 0.05 },
    },
  };
}