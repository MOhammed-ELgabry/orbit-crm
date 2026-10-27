import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gsap, useRopeDrop } from "./gsapMotion";

function Card() {
  const ref = useRopeDrop<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="card">
      <button type="button">Sign in</button>
    </div>
  );
}

function stubMotionPreference(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRopeDrop", () => {
  it("lowers the element in from above, pivoting about a point over it", () => {
    stubMotionPreference(false);
    render(<Card />);
    const card = screen.getByTestId("card");

    // Starts above its resting place and invisible (no flash of the final
    // state before the drop), hung from an anchor above the element.
    expect(gsap.getTweensOf(card).length).toBeGreaterThan(0);
    expect(Number(gsap.getProperty(card, "y"))).toBeLessThan(0);
    expect(Number(gsap.getProperty(card, "opacity"))).toBe(0);
    expect(card.style.transformOrigin).toContain("-90px");
  });

  it("leaves nothing behind when it unmounts mid-drop", () => {
    stubMotionPreference(false);
    const { unmount } = render(<Card />);
    const card = screen.getByTestId("card");
    expect(gsap.getTweensOf(card).length).toBeGreaterThan(0);

    unmount();

    expect(gsap.getTweensOf(card)).toHaveLength(0);
    expect(card.style.transform).toBe("");
    expect(card.style.opacity).toBe("");
  });

  it("does not block interaction while it is animating", () => {
    stubMotionPreference(false);
    render(<Card />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByTestId("card").style.pointerEvents).toBe("");
  });

  it("does not animate at all when the user prefers reduced motion", () => {
    stubMotionPreference(true);
    render(<Card />);
    const card = screen.getByTestId("card");

    expect(gsap.getTweensOf(card)).toHaveLength(0);
    expect(card.getAttribute("style")).toBeNull();
  });

  it("does not animate when the environment cannot report a preference", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Card />);

    expect(gsap.getTweensOf(screen.getByTestId("card"))).toHaveLength(0);
  });
});
