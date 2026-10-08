import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("../../services/notificationService", () => service);
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

import NotificationBell from "./NotificationBell";
import { listResult, makeNotification } from "../../test/notificationFixtures";
import { renderWithNotifications } from "../../test/renderNotifications";

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getUnreadCount.mockResolvedValue(0);
    service.listNotifications.mockResolvedValue(listResult([]));
    service.markNotificationRead.mockResolvedValue(undefined);
    service.markAllNotificationsRead.mockResolvedValue(2);
  });

  it("shows the unread count badge and an accessible label", async () => {
    service.getUnreadCount.mockResolvedValue(4);
    renderWithNotifications(<NotificationBell />);

    expect(await screen.findByTestId("notification-badge")).toHaveTextContent(
      "4",
    );
    expect(
      screen.getByRole("button", { name: "Notifications, 4 unread" }),
    ).toBeInTheDocument();
  });

  it("caps the badge at 99+", async () => {
    service.getUnreadCount.mockResolvedValue(250);
    renderWithNotifications(<NotificationBell />);

    expect(await screen.findByTestId("notification-badge")).toHaveTextContent(
      "99+",
    );
  });

  it("shows no badge when there is nothing unread", async () => {
    renderWithNotifications(<NotificationBell />);

    await waitFor(() => expect(service.getUnreadCount).toHaveBeenCalled());
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("does not crash and shows no badge when the unread-count API fails", async () => {
    service.getUnreadCount.mockRejectedValue(new Error("500"));
    renderWithNotifications(<NotificationBell />);

    await waitFor(() => expect(service.getUnreadCount).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });

  it("shows a loading state while the list is being fetched", async () => {
    let resolve: (value: ReturnType<typeof listResult>) => void = () => {};
    service.listNotifications.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Loading");

    resolve(listResult([makeNotification({ title: "Done loading" })]));
    expect(await screen.findByText("Done loading")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(
      await screen.findByText("You have no notifications yet."),
    ).toBeInTheDocument();
  });

  it("shows a friendly error with retry when the list API fails (no internals leaked)", async () => {
    service.listNotifications.mockRejectedValueOnce(
      new Error("TypeError: secret stack trace"),
    );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load your notifications.");
    expect(alert).not.toHaveTextContent(/stack|TypeError/i);

    service.listNotifications.mockResolvedValueOnce(
      listResult([makeNotification({ title: "Recovered" })]),
    );
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Recovered")).toBeInTheDocument();
  });

  it("opens an item: marks it read, navigates to the dashboard path and closes", async () => {
    const item = makeNotification({
      id: "n-open",
      title: "Open me",
      path: "/dashboard/deals/d1",
    });
    service.getUnreadCount.mockResolvedValue(1);
    service.listNotifications.mockResolvedValue(listResult([item]));
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    await user.click(await screen.findByText("Open me"));

    expect(service.markNotificationRead).toHaveBeenCalledWith("n-open");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/deals/d1",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Optimistic: the badge is gone immediately.
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });

  it("refuses to navigate to an unsafe path from a poisoned notification", async () => {
    const item = makeNotification({
      title: "Poisoned",
      path: "https://evil.example/phish",
    });
    service.listNotifications.mockResolvedValue(listResult([item]));
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />, "/dashboard/contacts");

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(await screen.findByText("Poisoned"));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/contacts",
    );
  });

  it("marks everything read from the popover", async () => {
    service.getUnreadCount.mockResolvedValue(2);
    service.listNotifications.mockResolvedValue(
      listResult([
        makeNotification({ title: "A" }),
        makeNotification({ title: "B" }),
      ]),
    );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(
      await screen.findByRole("button", { name: "Notifications, 2 unread" }),
    );
    await screen.findByText("A");
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(service.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByTestId("notification-badge"),
      ).not.toBeInTheDocument(),
    );
  });

  it("rolls the unread state back when marking all read fails", async () => {
    service.getUnreadCount.mockResolvedValue(2);
    service.listNotifications.mockResolvedValue(
      listResult([makeNotification({ title: "A" })]),
    );
    service.markAllNotificationsRead.mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(
      await screen.findByRole("button", { name: "Notifications, 2 unread" }),
    );
    await screen.findByText("A");
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    // The server count is re-fetched and wins.
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent(
      "2",
    );
  });

  it("closes on Escape and on an outside click", async () => {
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links to the full notifications page", async () => {
    const user = userEvent.setup();
    renderWithNotifications(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(
      await screen.findByRole("link", { name: "View all notifications" }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/notifications",
    );
  });
});