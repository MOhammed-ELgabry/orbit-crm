import { describe, expect, it } from "vitest";

import { safeDashboardPath } from "./notificationLinks";

describe("safeDashboardPath", () => {
  it.each([
    "/dashboard",
    "/dashboard/tasks",
    "/dashboard/deals/abc-123",
    "/dashboard/leads/L_1?x=1",
  ])("accepts the in-app path %s", (path) => {
    expect(safeDashboardPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example/dashboard",
    "//evil.example/dashboard",
    "/dashboard/..\\evil",
    "javascript:alert(1)",
    "/dashboardevil",
    "/dashboard:80/x",
    "/login",
    "dashboard/tasks",
    "",
  ])("rejects %s", (path) => {
    expect(safeDashboardPath(path)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(safeDashboardPath(null)).toBeNull();
    expect(safeDashboardPath(undefined)).toBeNull();
  });
});