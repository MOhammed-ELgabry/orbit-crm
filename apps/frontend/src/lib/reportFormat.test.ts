import { describe, expect, it } from "vitest";

import {
  formatDecimalString,
  formatPercentString,
  toChartNumber,
} from "./reportFormat";

describe("reportFormat", () => {
  it("keeps every cent of a value too large for a safe JS number", () => {
    // 10000002124.06 is fine as a double, but 12345678901234567.89 is not.
    expect(formatDecimalString("12345678901234567.89", "en-US")).toBe(
      "12,345,678,901,234,567.89",
    );
  });

  it("keeps trailing zeros exactly as the backend sent them", () => {
    expect(formatDecimalString("1000.50", "en-US")).toBe("1,000.50");
    expect(formatDecimalString("0.00", "en-US")).toBe("0.00");
  });

  it("handles negatives and integers without a fraction", () => {
    expect(formatDecimalString("-1500.25", "en-US")).toBe("-1,500.25");
    expect(formatDecimalString("42", "en-US")).toBe("42");
  });

  it("returns anything that is not a plain decimal string unchanged", () => {
    expect(formatDecimalString("1e5", "en-US")).toBe("1e5");
    expect(formatDecimalString("abc", "en-US")).toBe("abc");
  });

  it("formats a percentage string and never turns null into 0%", () => {
    expect(formatPercentString("66.67", "—", "en-US")).toBe("66.67%");
    expect(formatPercentString(null)).toBe("—");
  });

  it("only uses a JS number for chart geometry", () => {
    expect(toChartNumber("1234.50")).toBe(1234.5);
    expect(toChartNumber("not a number")).toBe(0);
  });
});
