import { describe, expect, it } from "vitest";

import {
  buildPeriod,
  formatLocalDate,
  MAX_REPORT_RANGE_DAYS,
  presetRange,
  validateRange,
} from "./reportPeriod";

describe("reportPeriod", () => {
  const now = new Date(2026, 9, 10, 23, 59); // 10 Oct 2026, late evening local

  it("formats the LOCAL calendar day, never the UTC one", () => {
    expect(formatLocalDate(now)).toBe("2026-10-10");
    expect(formatLocalDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("builds inclusive preset ranges on calendar days", () => {
    expect(presetRange("last7", now)).toEqual({
      from: "2026-10-04",
      to: "2026-10-10",
    });
    expect(presetRange("last30", now)).toEqual({
      from: "2026-09-11",
      to: "2026-10-10",
    });
    expect(presetRange("thisMonth", now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
    expect(presetRange("lastMonth", now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("rolls last month across a year boundary", () => {
    expect(presetRange("lastMonth", new Date(2026, 0, 15))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("mirrors the backend range rules", () => {
    expect(validateRange("2026-10-01", "2026-10-31")).toBeNull();
    expect(validateRange("2026-10-01", "2026-10-01")).toBeNull();
    expect(validateRange("", "2026-10-31")).toBe("incomplete");
    expect(validateRange("2026-02-30", "2026-03-01")).toBe("incomplete");
    expect(validateRange("2026-10-31", "2026-10-01")).toBe("order");
    expect(validateRange("2025-01-01", "2026-12-31")).toBe("tooLong");
  });

  it("accepts exactly the maximum span and rejects one day more", () => {
    // 2026-01-01 + 365 days = 2027-01-01 -> 366 inclusive days
    expect(MAX_REPORT_RANGE_DAYS).toBe(366);
    expect(validateRange("2026-01-01", "2027-01-01")).toBeNull();
    expect(validateRange("2026-01-01", "2027-01-02")).toBe("tooLong");
  });

  it("attaches the viewer's time zone to a period", () => {
    expect(
      buildPeriod({ from: "2026-10-01", to: "2026-10-31" }, "Africa/Cairo"),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      timezone: "Africa/Cairo",
    });
  });
});
