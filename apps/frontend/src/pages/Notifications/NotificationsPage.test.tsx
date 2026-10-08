import { screen, waitFor } from "@testing-library/react";
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

import NotificationsPage from "./NotificationsPage";
import { listResult, makeNotification } from "../../test/notificationFixtures";
import { renderWithNotifications } from "../../test/renderNotifications";

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getUnreadCount.mockResolvedValue(0);
    service.listNotifications.mockResolvedValue(listResult([]));
    service.markNotificationRead.mockResolvedValue(undefined);
    service.markAllNotificationsRead.mockResolvedValue(1);
  });

  it("renders notifications with read/unread state", async () => {
    service.getUnreadCount.mockResolvedValue(1);
    service.listNotifications.mockResolvedValue(
      listResult([
        makeNotification({
          title: "New task for you",
          body: "Sara assigned you X",
        }),
        makeNotification({
          title: "Old one",
          body: "Already seen",
          readAt: new Date().toISOString(),
        }),
      ]),
    );
    renderWithNotifications(<NotificationsPage />, "/dashboard/notifications");

    expect(await screen.findByText("New task for you")).toBeInTheDocument();
    expect(screen.getByText("Sara assigned you X")).toBeInTheDocument();
    expect(screen.getByText("Old one")).toBeInTheDocument();

    // Exactly one row is flagged as unread.
    expect(screen.getAllByLabelText("Unread")).toHaveLength(1);
    expect(
      await screen.findByText("You have 1 unread notifications."),
    ).toBeInTheDocument();
  });

  it("shows a loading state first", async () => {
    let resolve: (value: ReturnType<typeof listResult>) => void = () => {};
    service.listNotifications.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderWithNotifications(<NotificationsPage />);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading");

    resolve(listResult([makeNotification({ title: "Arrived" })]));
    expect(await screen.findByText("Arrived")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    renderWithNotifications(<NotificationsPage />);

    expect(
      await screen.findByText("You have no notifications yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark all as read" }),
    ).toBeDisabled();
  });

  it("marks a single notification as read when it is opened", async () => {
    service.getUnreadCount.mockResolvedValue(1);
    service.listNotifications.mockResolvedValue(
      listResult([
        makeNotification({
          id: "n-1",
          title: "Click me",
          path: "/dashboard/leads/l1",
        }),
      ]),
    );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationsPage />, "/dashboard/notifications");

    await user.click(await screen.findByText("Click me"));

    expect(service.markNotificationRead).toHaveBeenCalledWith("n-1");
    await waitFor(() =>
      expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/leads/l1",
    );
  });

  it("restores the unread state if marking one as read fails", async () => {
    service.getUnreadCount.mockResolvedValue(1);
    service.listNotifications.mockResolvedValue(
      listResult([makeNotification({ id: "n-1", title: "Flaky", path: null })]),
    );
    service.markNotificationRead.mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    renderWithNotifications(<NotificationsPage />);

    await user.click(await screen.findByText("Flaky"));

    await waitFor(() =>
      expect(screen.getByLabelText("Unread")).toBeInTheDocument(),
    );
  });

  it("marks all as read", async () => {
    service.getUnreadCount.mockResolvedValue(2);
    service.listNotifications.mockResolvedValue(
      listResult([
        makeNotification({ title: "One" }),
        makeNotification({ title: "Two" }),
      ]),
    );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationsPage />);

    await screen.findByText("One");
    expect(screen.getAllByLabelText("Unread")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(service.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it("shows a friendly error (no internals) and can retry", async () => {
    service.listNotifications.mockRejectedValueOnce(
      new Error("AxiosError: connect ECONNREFUSED 10.0.0.5"),
    );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load your notifications.");
    expect(alert).not.toHaveTextContent(/ECONNREFUSED|Axios|10\.0\.0\.5/);

    service.listNotifications.mockResolvedValueOnce(
      listResult([makeNotification({ title: "Back online" })]),
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Back online")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads the next page and de-duplicates rows", async () => {
    const first = makeNotification({ id: "a", title: "First page" });
    service.listNotifications
      .mockResolvedValueOnce(listResult([first], true))
      .mockResolvedValueOnce(
        listResult([
          first, // overlap because a new notification shifted the pages
          makeNotification({ id: "b", title: "Second page" }),
        ]),
      );
    const user = userEvent.setup();
    renderWithNotifications(<NotificationsPage />);

    await screen.findByText("First page");
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Second page")).toBeInTheDocument();
    expect(screen.getAllByText("First page")).toHaveLength(1);
    expect(service.listNotifications).toHaveBeenLastCalledWith({
      page: 2,
      limit: 20,
    });
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});