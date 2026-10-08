import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreference: vi.fn(),
}));
const push = vi.hoisted(() => {
  class PushError extends Error {
    reason: string;
    constructor(reason: string) {
      super(`push_${reason}`);
      this.reason = reason;
    }
  }
  return {
    PushError,
    isPushSupported: vi.fn(),
    getPushPermission: vi.fn(),
    getCurrentPushSubscription: vi.fn(),
    enablePush: vi.fn(),
    disablePush: vi.fn(),
  };
});

vi.mock("../../services/notificationService", () => service);
vi.mock("../../lib/push", () => push);
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));

import "../../i18n";
import NotificationSettings from "./NotificationSettings";
import { makePreferences } from "../../test/notificationFixtures";

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getNotificationPreferences.mockResolvedValue(makePreferences());
    push.isPushSupported.mockReturnValue(true);
    push.getPushPermission.mockReturnValue("default");
    push.getCurrentPushSubscription.mockResolvedValue(null);
    push.enablePush.mockResolvedValue(undefined);
    push.disablePush.mockResolvedValue(undefined);
  });

  it("loads the preferences and reflects them in the switches", async () => {
    service.getNotificationPreferences.mockResolvedValue(
      makePreferences({ email: true, push: false }),
    );
    render(<NotificationSettings />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading");

    const email = await screen.findByRole("switch", {
      name: "Email notifications",
    });
    expect(email).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Push notifications" }),
    ).not.toBeChecked();
  });

  it("states that in-app notifications are always on and offers no switch for them", async () => {
    render(<NotificationSettings />);

    expect(await screen.findByText("In-app notifications")).toBeInTheDocument();
    expect(screen.getByText("Always on.")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("never asks for browser permission just by opening the page", async () => {
    render(<NotificationSettings />);
    await screen.findByRole("switch", { name: "Email notifications" });

    expect(push.enablePush).not.toHaveBeenCalled();
  });

  it("updates the email preference and sends only channel + value", async () => {
    service.updateNotificationPreference.mockResolvedValue(
      makePreferences({ email: false }),
    );
    const user = userEvent.setup();
    render(<NotificationSettings />);

    await user.click(
      await screen.findByRole("switch", { name: "Email notifications" }),
    );

    expect(service.updateNotificationPreference).toHaveBeenCalledTimes(1);
    expect(service.updateNotificationPreference).toHaveBeenCalledWith(
      "email",
      false,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Email notifications" }),
      ).not.toBeChecked(),
    );
  });

  it("updates the push preference", async () => {
    service.updateNotificationPreference.mockResolvedValue(
      makePreferences({ push: true }),
    );
    const user = userEvent.setup();
    render(<NotificationSettings />);

    await user.click(
      await screen.findByRole("switch", { name: "Push notifications" }),
    );

    expect(service.updateNotificationPreference).toHaveBeenCalledWith(
      "push",
      true,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Push notifications" }),
      ).toBeChecked(),
    );
  });

  it("keeps the old value and shows a friendly error when saving fails", async () => {
    service.updateNotificationPreference.mockRejectedValue(
      new Error("AxiosError 500 internal"),
    );
    const user = userEvent.setup();
    render(<NotificationSettings />);

    await user.click(
      await screen.findByRole("switch", { name: "Email notifications" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't save that change.");
    expect(alert).not.toHaveTextContent(/Axios|500|internal/);
    expect(
      screen.getByRole("switch", { name: "Email notifications" }),
    ).toBeChecked();
  });

  it("shows a load error with a retry that recovers", async () => {
    service.getNotificationPreferences.mockRejectedValueOnce(new Error("down"));
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "We couldn't load your notification settings.",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("switch", { name: "Email notifications" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the email switch when email is unavailable on the server", async () => {
    service.getNotificationPreferences.mockResolvedValue(
      makePreferences({ emailAvailable: false }),
    );
    render(<NotificationSettings />);

    expect(
      await screen.findByRole("switch", { name: "Email notifications" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Email notifications are not available right now."),
    ).toBeInTheDocument();
  });

  describe("this device", () => {
    it("enables push on this device and refreshes the device count", async () => {
      service.getNotificationPreferences
        .mockResolvedValueOnce(makePreferences())
        .mockResolvedValueOnce(
          makePreferences({
            push: true,
            devices: [
              {
                id: "d1",
                label: null,
                createdAt: new Date().toISOString(),
                lastSuccessAt: null,
              },
            ],
          }),
        );
      const user = userEvent.setup();
      render(<NotificationSettings />);

      await user.click(
        await screen.findByRole("button", { name: "Enable on this device" }),
      );

      expect(push.enablePush).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByRole("button", { name: "Disable on this device" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Registered devices: 1")).toBeInTheDocument();
    });

    it("shows a friendly message when the browser permission is denied", async () => {
      push.enablePush.mockRejectedValue(new push.PushError("denied"));
      const user = userEvent.setup();
      render(<NotificationSettings />);

      await user.click(
        await screen.findByRole("button", { name: "Enable on this device" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Notifications are blocked for this site.",
      );
      // Orbit keeps working and the user can still try again later.
      expect(
        screen.getByRole("button", { name: "Enable on this device" }),
      ).toBeEnabled();
    });

    it("shows a generic message for unexpected failures (no stack trace)", async () => {
      push.enablePush.mockRejectedValue(new TypeError("boom at line 42"));
      const user = userEvent.setup();
      render(<NotificationSettings />);

      await user.click(
        await screen.findByRole("button", { name: "Enable on this device" }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("We couldn't update push notifications");
      expect(alert).not.toHaveTextContent(/boom|TypeError|line 42/);
    });

    it("explains when the browser does not support push and offers no button", async () => {
      push.isPushSupported.mockReturnValue(false);
      push.getPushPermission.mockReturnValue("unsupported");
      render(<NotificationSettings />);

      expect(
        await screen.findByText(
          "This browser doesn't support push notifications.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Enable on this device" }),
      ).not.toBeInTheDocument();
    });

    it("shows the blocked-permission hint up front when the browser already denied it", async () => {
      push.getPushPermission.mockReturnValue("denied");
      render(<NotificationSettings />);

      expect(
        await screen.findByText(/Notifications are blocked for this site/),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Enable on this device" }),
      ).not.toBeInTheDocument();
    });

    it("shows 'not available' when the server has push switched off", async () => {
      service.getNotificationPreferences.mockResolvedValue(
        makePreferences({ pushAvailable: false }),
      );
      render(<NotificationSettings />);

      expect(
        await screen.findByText(
          "Push notifications are not available right now.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("switch", { name: "Push notifications" }),
      ).toBeDisabled();
    });

    it("unsubscribes this device", async () => {
      push.getCurrentPushSubscription.mockResolvedValue({
        endpoint: "https://push.example.com/x",
      });
      const user = userEvent.setup();
      render(<NotificationSettings />);

      await user.click(
        await screen.findByRole("button", { name: "Disable on this device" }),
      );

      expect(push.disablePush).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByRole("button", { name: "Enable on this device" }),
      ).toBeInTheDocument();
    });
  });
});