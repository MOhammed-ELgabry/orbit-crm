import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  state: { isAuthenticated: true, isLoading: false },
}));

// The real route table, ProtectedRoute, header button and MY ERP page are
// exercised; only session state, data providers and heavy chrome are stubbed.
vi.mock("../../context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ ...auth.state, user: null }),
}));
vi.mock("../../context/NotificationsProvider", () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("../../context/ChatProvider", () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../Components/Notification/ChatNotificationsBridge", () => ({
  default: () => null,
}));
vi.mock("../../Components/Notification/NotificationBell", () => ({
  default: () => <button type="button">Notifications</button>,
}));
vi.mock("../../Components/Chat/ChatButton", () => ({ default: () => null }));
vi.mock("../../Components/Dashboard/DatePicker", () => ({
  default: () => null,
}));
vi.mock("../../pages/dashboard/DashboardPage", () => ({
  default: () => <p>dashboard home</p>,
}));
vi.mock("../../Components/Dashboard/DashboardLayout", async () => {
  const { default: DashboardHeader } =
    await import("../../Components/Dashboard/DashboardHeader");
  return {
    default: () => (
      <>
        <DashboardHeader onOpenNavigation={() => undefined} />
        <Outlet />
      </>
    ),
  };
});

import "../../i18n";
import App from "../../App";
import { gsap } from "../../lib/gsapMotion";

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const open = (path: string) => window.history.pushState({}, "", path);

beforeEach(() => {
  auth.state = { isAuthenticated: true, isLoading: false };
  stubMotion(true);
  open("/dashboard");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MY ERP navigation", () => {
  it("shows a MY ERP link next to Notifications that opens the placeholder page", async () => {
    render(<App />);

    const link = await screen.findByRole("link", { name: "MY ERP" });
    const bell = screen.getByRole("button", { name: "Notifications" });
    expect(link).toHaveAttribute("href", "/dashboard/my-erp");
    // Same row, directly before the bell.
    expect(link.parentElement).toBe(bell.parentElement);
    expect(link.nextElementSibling).toBe(bell);

    await userEvent.click(link);

    expect(await screen.findByText("COMING SOON")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard/my-erp");
    expect(screen.getByRole("heading", { name: "MY ERP" })).toBeInTheDocument();
  });

  it("is reachable and activatable with the keyboard", async () => {
    render(<App />);
    const link = await screen.findByRole("link", { name: "MY ERP" });

    link.focus();
    expect(link).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("COMING SOON")).toBeInTheDocument();
  });

  it("Back to Dashboard goes to /dashboard even with nothing to go back to", async () => {
    // Deep link: the page is the first entry, so history.back() would leave
    // the app (or do nothing). The button must navigate by itself.
    open("/dashboard/my-erp");
    render(<App />);

    const back = await screen.findByRole("link", { name: "Back to Dashboard" });
    expect(back).toHaveAttribute("href", "/dashboard");

    const historyBack = vi.spyOn(window.history, "back");
    await userEvent.click(back);

    expect(await screen.findByText("dashboard home")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(historyBack).not.toHaveBeenCalled();
  });

  it("is protected: a signed-out visitor is sent to login, not shown the page", async () => {
    auth.state = { isAuthenticated: false, isLoading: false };
    open("/dashboard/my-erp");
    render(<App />);

    await vi.waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(screen.queryByText("COMING SOON")).not.toBeInTheDocument();
  });

  it("shows nothing before the session check finishes", () => {
    auth.state = { isAuthenticated: false, isLoading: true };
    open("/dashboard/my-erp");
    render(<App />);

    expect(screen.queryByText("COMING SOON")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard/my-erp");
  });
});

describe("MY ERP scene motion", () => {
  it("hangs the sign from two ropes", async () => {
    open("/dashboard/my-erp");
    const { container } = render(<App />);

    await screen.findByText("COMING SOON");
    expect(container.querySelectorAll(".orbit-erp-rope")).toHaveLength(2);
  });

  it("drops the rig in with GSAP and cleans up when the page is left", async () => {
    stubMotion(false);
    open("/dashboard/my-erp");
    const { unmount } = render(<App />);

    const rig = await screen.findByTestId("my-erp-rig");
    expect(gsap.getTweensOf(rig).length).toBeGreaterThan(0);
    expect(Number(gsap.getProperty(rig, "y"))).toBeLessThan(0);

    unmount();

    expect(gsap.getTweensOf(rig)).toHaveLength(0);
  });

  it("does not animate for reduced motion: the sign is simply there", async () => {
    open("/dashboard/my-erp");
    render(<App />);

    const rig = await screen.findByTestId("my-erp-rig");
    expect(gsap.getTweensOf(rig)).toHaveLength(0);
    expect(rig.getAttribute("style")).toBeNull();
  });
});
