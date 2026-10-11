import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReportBarChart from "./ReportBarChart";

/**
 * Renders the REAL recharts chart (no mocking of recharts) against the
 * installed React 19 / react-is 16 pair. jsdom has no layout, so the
 * ResizeObserver and element sizes the ResponsiveContainer needs are
 * stubbed with a fixed 400x220 box.
 *
 * This is the evidence behind leaving `react-is` untouched: with the cells
 * passed as an array (see ReportBarChart), recharts 3.x draws every bar
 * under react-is 16.13.1, with no errors logged.
 */
describe("ReportBarChart (real recharts)", () => {
  const originalRO = globalThis.ResizeObserver;

  beforeEach(() => {
    class FakeResizeObserver {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        this.cb(
          [
            {
              target,
              contentRect: { width: 400, height: 220 } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;

    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(220);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(220);
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalRO;
    vi.restoreAllMocks();
  });

  it("draws one coloured bar per datum without logging errors", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <ReportBarChart
        ariaLabel="Open value by stage"
        data={[
          { label: "New", value: 100.5, display: "100.50", color: "#3B82F6" },
          { label: "Won", value: 50, display: "50.00", color: "#10B981" },
          { label: "Lost", value: 5, display: "5.00" },
        ]}
      />,
    );

    expect(
      container.querySelector('[aria-label="Open value by stage"]'),
    ).not.toBeNull();
    expect(container.querySelector("svg.recharts-surface")).not.toBeNull();
    // One <path> per bar rectangle (recharts renders bars as paths).
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(
      3,
    );
    expect(errors).not.toHaveBeenCalled();
  });

  it("keeps the chart frame left-to-right inside an RTL page", () => {
    const { container } = render(
      <ReportBarChart
        ariaLabel="x"
        data={[{ label: "A", value: 1, display: "1" }]}
      />,
    );

    expect(container.firstElementChild?.getAttribute("dir")).toBe("ltr");
  });
});
