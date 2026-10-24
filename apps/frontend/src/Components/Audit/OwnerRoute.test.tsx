import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  value: { user: null as null | { isOwner: boolean }, isLoading: false },
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth.value }));

import OwnerRoute from "./OwnerRoute";

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/dashboard/audit-log"]}>
      <Routes>
        <Route path="/dashboard" element={<p>Dashboard home</p>} />
        <Route
          path="/dashboard/audit-log"
          element={
            <OwnerRoute>
              <p>Secret audit page</p>
            </OwnerRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OwnerRoute (UX gate only)", () => {
  beforeEach(() => {
    auth.value = { user: null, isLoading: false };
  });

  it("renders the page for an Owner", () => {
    auth.value = { user: { isOwner: true }, isLoading: false };
    renderRoute();

    expect(screen.getByText("Secret audit page")).toBeInTheDocument();
  });

  it("redirects a non-Owner to the dashboard", () => {
    auth.value = { user: { isOwner: false }, isLoading: false };
    renderRoute();

    expect(screen.queryByText("Secret audit page")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard home")).toBeInTheDocument();
  });

  it("redirects when there is no user", () => {
    renderRoute();

    expect(screen.queryByText("Secret audit page")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard home")).toBeInTheDocument();
  });

  it("renders nothing while the session is still being resolved (no flash, no redirect)", () => {
    auth.value = { user: null, isLoading: true };
    renderRoute();

    expect(screen.queryByText("Secret audit page")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard home")).not.toBeInTheDocument();
  });
});
