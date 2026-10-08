import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
const auth = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("../services/notificationService", () => service);
vi.mock("../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("./AuthContext", () => ({ useAuth: () => auth }));

import {
  MAX_POLL_INTERVAL_MS,
  NotificationsProvider,
  POLL_INTERVAL_MS,
} from "./NotificationsProvider";
import { useNotifications } from "../hooks/useNotifications";

function Probe() {
  const { unreadCount } = useNotifications();
  return <span data-testid="count">{unreadCount}</span>;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("NotificationsProvider polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    service.getUnreadCount.mockResolvedValue(3);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches the unread count on mount and then every 60 seconds", async () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );
    await flush();

    expect(screen.getByTestId("count")).toHaveTextContent("3");
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    service.getUnreadCount.mockResolvedValue(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("count")).toHaveTextContent("5");
  });

  it("pauses while the tab is hidden and catches up when it is visible again", async () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );
    await flush();
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);
  });

  it("does not start the 60s cadence when the page loads in a hidden tab", async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );
    await flush();
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially after failures, capped, and never crashes", async () => {
    service.getUnreadCount.mockRejectedValue(new Error("down"));

    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );
    await flush();
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    // 1 failure -> next poll after 2x the base interval, not 1x.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);

    // Many failures later the delay is capped.
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(MAX_POLL_INTERVAL_MS);
      });
    }
    const calls = service.getUnreadCount.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_POLL_INTERVAL_MS);
    });
    expect(service.getUnreadCount.mock.calls.length).toBe(calls + 1);
  });

  it("does not poll at all when signed out", async () => {
    auth.isAuthenticated = false;

    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });

    expect(service.getUnreadCount).not.toHaveBeenCalled();
  });
});