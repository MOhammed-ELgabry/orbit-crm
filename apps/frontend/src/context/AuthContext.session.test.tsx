import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logoutUser: vi.fn(),
}));
const companyService = vi.hoisted(() => ({ getMyCompany: vi.fn() }));
const apiMock = vi.hoisted(() => ({
  listener: null as null | (() => void),
  markSessionActive: vi.fn(),
  markSessionInactive: vi.fn(),
  setSessionEndedListener: vi.fn((l: () => void) => {
    apiMock.listener = l;
    return () => {
      if (apiMock.listener === l) apiMock.listener = null;
    };
  }),
}));
const posthog = vi.hoisted(() => ({
  identifyAnalyticsUser: vi.fn(),
  resetAnalyticsIdentity: vi.fn(),
}));

vi.mock("../services/authService", () => authService);
vi.mock("../services/companyService", () => companyService);
vi.mock("../services/api", () => apiMock);
vi.mock("../lib/posthog", () => posthog);
vi.mock("i18next", () => ({ default: { changeLanguage: vi.fn() } }));
vi.mock("../lib/push", () => ({ detachPushOnLogout: vi.fn() }));

import { AuthProvider } from "./AuthContext";
import { ProtectedRoute } from "../Components/ProtectedRoute";

const user = {
  id: "u1",
  email: "a@example.com",
  firstName: "A",
  lastName: "B",
  avatar: null,
  isOwner: false,
  language: "en" as const,
  backgroundColor: null,
  permissions: ["deal:read"],
};

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>private area</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AuthProvider — session ended by the API layer (D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.listener = null;
    authService.getCurrentUser.mockResolvedValue({ user });
    companyService.getMyCompany.mockResolvedValue({ id: "c1" });
  });

  it("marks the session active after a successful session restore", async () => {
    renderApp();

    expect(await screen.findByText("private area")).toBeInTheDocument();
    expect(apiMock.markSessionActive).toHaveBeenCalled();
  });

  it("drops to the unauthenticated state and redirects to /login when the session ends", async () => {
    renderApp();
    expect(await screen.findByText("private area")).toBeInTheDocument();
    expect(apiMock.listener).toBeTypeOf("function");

    act(() => {
      apiMock.listener?.();
    });

    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("private area")).not.toBeInTheDocument();
    expect(posthog.resetAnalyticsIdentity).toHaveBeenCalledTimes(1);
    // Local state only: the cookies are already dead server-side, so no
    // /auth/logout request is fired from the listener.
    expect(authService.logoutUser).not.toHaveBeenCalled();
  });

  it("stays on /login when the initial session check fails (no redirect loop)", async () => {
    authService.getCurrentUser.mockRejectedValue(new Error("401"));

    renderApp();

    await waitFor(() =>
      expect(screen.getByText("login page")).toBeInTheDocument(),
    );
    expect(companyService.getMyCompany).not.toHaveBeenCalled();
  });

  it("unsubscribes the listener on unmount", async () => {
    const { unmount } = renderApp();
    await screen.findByText("private area");
    expect(apiMock.listener).not.toBeNull();

    unmount();

    expect(apiMock.listener).toBeNull();
  });
});
