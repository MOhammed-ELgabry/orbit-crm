import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CountUp from "./CountUp";

function stubMotion(reduce: boolean) {
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

describe("CountUp", () => {
  beforeEach(() => stubMotion(false));
  afterEach(() => vi.unstubAllGlobals());

  it("starts from zero and ends on the exact real value", async () => {
    render(<CountUp value={1250} duration={0.15} />);

    const el = document.querySelector(".orbit-countup") as HTMLElement;
    // First paint is 0 (or already moving), never the final value up front.
    expect(el.textContent).not.toBe("1,250");

    await waitFor(() => expect(el.textContent).toBe("1,250"), {
      timeout: 2000,
    });
    expect(el.dataset.final).toBe("1,250");
  });

  it("keeps decimals and the suffix, and ends on the exact string", async () => {
    render(<CountUp value="66.67" suffix="%" duration={0.15} />);

    expect(
      await screen.findByText("66.67%", {}, { timeout: 2000 }),
    ).toBeTruthy();
  });

  it("shows the exact final text at once under reduced motion", () => {
    stubMotion(true);
    render(<CountUp value="40.00" suffix="%" />);

    expect(screen.getByText("40.00%")).toBeTruthy();
  });

  it("never rounds a value too large for a JS number", () => {
    render(<CountUp value="12345678901234567.89" />);

    // Not animated (it would lose digits): exact text immediately.
    expect(screen.getByText("12,345,678,901,234,567.89")).toBeTruthy();
  });

  it("animates from the shown value, not from zero, when the value changes", async () => {
    const { rerender } = render(<CountUp value={100} duration={0.1} />);
    const el = document.querySelector(".orbit-countup") as HTMLElement;
    await waitFor(() => expect(el.textContent).toBe("100"), { timeout: 2000 });

    rerender(<CountUp value={200} duration={0.1} />);
    // Right after the change it must not have fallen back to a low number.
    expect(Number(el.textContent?.replace(/,/g, ""))).toBeGreaterThanOrEqual(
      100,
    );
    await waitFor(() => expect(el.textContent).toBe("200"), { timeout: 2000 });
  });
});
