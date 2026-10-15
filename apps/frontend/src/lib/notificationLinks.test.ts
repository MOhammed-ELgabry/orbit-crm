import { describe, expect, it } from "vitest";

import { safeDashboardPath } from "./notificationLinks";

describe("safeDashboardPath", () => {
  it.each([
    "/dashboard",
    "/dashboard/tasks",
    "/dashboard/deals/abc-123",
    "/dashboard/leads/L_1?x=1",
    "/dashboard/chat",
    "/dashboard/chat?c=0b9f6a52-1c1e-4f43-9a55-3c9a1d1e7a10",
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
