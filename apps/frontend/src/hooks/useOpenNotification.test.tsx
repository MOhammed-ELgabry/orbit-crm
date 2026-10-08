import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const markRead = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("./useNotifications", () => ({
  useNotifications: () => ({ markRead }),
}));
vi.mock("../lib/posthog", () => ({ trackEvent: track }));

import { useOpenNotification } from "./useOpenNotification";
import { makeNotification } from "../test/notificationFixtures";

describe("useOpenNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks read, tracks only the type, navigates to a dashboard path and runs the callback", () => {
    const after = vi.fn();
    const { result } = renderHook(() => useOpenNotification(after));
    const item = makeNotification({
      id: "n1",
      type: "deal.won",
      path: "/dashboard/deals/d1",
    });

    result.current(item);

    expect(markRead).toHaveBeenCalledWith("n1");
    expect(track).toHaveBeenCalledWith("notification_opened", {
      type: "deal.won",
    });
    expect(navigate).toHaveBeenCalledWith("/dashboard/deals/d1");
    expect(after).toHaveBeenCalledTimes(1);
  });

  it.each([
    "https://evil.example/x",
    "//evil.example/x",
    "javascript:alert(1)",
    "/login",
  ])("never navigates to %s", (path) => {
    const { result } = renderHook(() => useOpenNotification());

    result.current(makeNotification({ path }));

    expect(navigate).not.toHaveBeenCalled();
    // It is still marked read: opening it is what the user did.
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when the notification has no path", () => {
    const { result } = renderHook(() => useOpenNotification());

    result.current(makeNotification({ path: null }));

    expect(navigate).not.toHaveBeenCalled();
  });
});