import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { gsap, MOTION } from "../../lib/gsapMotion";
import type { HelperId } from "../../lib/helperRegistry";
import { prefersReducedMotion } from "../../lib/motionPreference";

const SHOW_DELAY_MS = 350; // hover intent: brushing past an item shows nothing
const HIDE_DELAY_MS = 120; // lets the pointer travel from the item to the bubble
const LONG_PRESS_MS = 500;
const TOUCH_VISIBLE_MS = 3500;
const GAP = 8;
const EDGE = 8;

type Placement = "top" | "bottom" | "side";

interface HintProps {
  id: HelperId;
  /** Exactly one element; its own handlers keep working. */
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  /** "side" puts the bubble beside the item (the sidebar's choice). */
  placement?: Placement;
  /**
   * Click toggles the bubble instead of dismissing it. For the "?" icon,
   * the touch-friendly way to open help where there is no hover.
   */
  toggleOnClick?: boolean;
}

interface Position {
  left: number;
  top: number;
}

function isFocusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    // Environment without :focus-visible support: treat focus as keyboard.
    return true;
  }
}

/**
 * Contextual helper: a small tooltip that explains what an element does.
 *
 * - Reads its text from the central helper registry (never inline).
 * - Opens on hover (after a short intent delay), on keyboard focus, and
 *   on a touch long-press; <HintIcon> adds tap-to-open for touch screens.
 * - Closes on mouse leave, blur, Escape, outside press, scroll and resize.
 * - Never intercepts the wrapped element's own clicks or navigation, and
 *   is described to assistive tech via aria-describedby while open.
 * - Wraps by cloning handlers onto the child, so it adds no DOM node and
 *   cannot disturb the existing layout.
 */
export default function Hint({
  id,
  children,
  placement = "top",
  toggleOnClick = false,
}: HintProps) {
  const { t } = useTranslation();
  const tooltipId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const touchHideTimer = useRef<number | undefined>(undefined);
  // Opened by a touch long-press (no mouse/keyboard to "leave" with).
  const [touchOpened, setTouchOpened] = useState(false);

  const clearTimers = useCallback(() => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(pressTimer.current);
    window.clearTimeout(touchHideTimer.current);
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setTouchOpened(false);
    setAnchor(null);
    setPosition(null);
  }, [clearTimers]);

  const openFor = useCallback((el: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    setAnchor(el);
  }, []);

  const scheduleOpen = useCallback(
    (el: HTMLElement) => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => openFor(el), SHOW_DELAY_MS);
    },
    [openFor],
  );

  const scheduleClose = useCallback(() => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(close, HIDE_DELAY_MS);
  }, [close]);

  const startPress = useCallback(
    (el: HTMLElement) => {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => {
        setTouchOpened(true);
        openFor(el);
        touchHideTimer.current = window.setTimeout(close, TOUCH_VISIBLE_MS);
      }, LONG_PRESS_MS);
    },
    [close, openFor],
  );

  const cancelPress = useCallback(() => {
    window.clearTimeout(pressTimer.current);
  }, []);

  const cancelClose = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Measure the bubble, then place it inside the viewport.
  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const bubble = bubbleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, Math.max(min, max)));

    let left: number;
    let top: number;

    if (placement === "side") {
      const rtl =
        window.getComputedStyle(document.documentElement).direction === "rtl";
      const after = rect.right + GAP;
      const before = rect.left - bubble.width - GAP;
      const preferred = rtl ? before : after;
      const fallback = rtl ? after : before;
      const fits = (x: number) => x >= EDGE && x + bubble.width <= vw - EDGE;

      left = fits(preferred)
        ? preferred
        : fits(fallback)
          ? fallback
          : preferred;
      top = rect.top + rect.height / 2 - bubble.height / 2;
    } else {
      left = rect.left + rect.width / 2 - bubble.width / 2;
      const above = rect.top - bubble.height - GAP;
      const below = rect.bottom + GAP;
      const wantTop = placement === "top";

      top = wantTop
        ? above >= EDGE
          ? above
          : below
        : below + bubble.height <= vh - EDGE
          ? below
          : above;
    }

    setPosition({
      left: clamp(left, EDGE, vw - bubble.width - EDGE),
      top: clamp(top, EDGE, vh - bubble.height - EDGE),
    });
  }, [anchor, placement]);

  // Short fade/lift once positioned (skipped for reduced motion).
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;

    if (!position || !bubble || prefersReducedMotion()) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.from(bubble, {
        opacity: 0,
        y: 4,
        duration: MOTION.fast,
        ease: MOTION.ease,
        clearProps: "opacity,transform",
      });
    });

    return () => context.revert();
  }, [position]);

  // Dismiss on outside press, scroll and resize while open.
  useEffect(() => {
    if (!anchor) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!anchor.contains(target) && !bubbleRef.current?.contains(target)) {
        close();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, close]);

  const childProps = children.props;
  const isOpen = anchor !== null;

  const title = t(`helper_${id}_title`);
  const body = t(`helper_${id}_body`);
  const benefit = t(`helper_${id}_benefit`, { defaultValue: "" });

  // The handlers below only ever run from DOM events, never during render;
  // the rule cannot see that through cloneElement and flags the timer refs
  // the handlers (indirectly) use.
  // eslint-disable-next-line react-hooks/refs
  const trigger = cloneElement(children, {
    "aria-describedby": isOpen ? tooltipId : childProps["aria-describedby"],
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(event);
      scheduleOpen(event.currentTarget);
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(event);
      if (!touchOpened && !toggleOnClick) {
        scheduleClose();
      }
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event);
      // `target` (not currentTarget): focus bubbles up from descendants.
      if (isFocusVisible(event.target as HTMLElement)) {
        openFor(event.currentTarget);
      }
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event);
      if (!touchOpened) {
        close();
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      childProps.onKeyDown?.(event);
      if (event.key === "Escape" && isOpen) {
        close();
      }
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      childProps.onClick?.(event);
      if (toggleOnClick) {
        if (isOpen) {
          close();
        } else {
          openFor(event.currentTarget);
        }
      } else if (!touchOpened) {
        // A real click means the item was understood; get out of the way.
        close();
      }
    },
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      childProps.onTouchStart?.(event);
      startPress(event.currentTarget);
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      childProps.onTouchEnd?.(event);
      cancelPress();
    },
    onTouchMove: (event: TouchEvent<HTMLElement>) => {
      childProps.onTouchMove?.(event);
      cancelPress();
    },
    onTouchCancel: (event: TouchEvent<HTMLElement>) => {
      childProps.onTouchCancel?.(event);
      cancelPress();
    },
  });

  return (
    <>
      {trigger}
      {isOpen &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tooltipId}
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={toggleOnClick ? undefined : scheduleClose}
            style={{
              position: "fixed",
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
            className="z-[100] w-max max-w-[16rem] rounded-xl bg-ink px-3 py-2.5 text-start text-xs leading-5 text-white shadow-pop"
          >
            <p className="font-semibold">{title}</p>
            <p className="mt-0.5 text-white/85">{body}</p>
            {benefit && (
              <p className="mt-1.5 text-brand-200">
                <span className="font-semibold">{t("helperBenefitLabel")}</span>{" "}
                {benefit}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
