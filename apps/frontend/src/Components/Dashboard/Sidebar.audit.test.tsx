import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("../../lib/swal", () => ({ confirmAlert: vi.fn() }));

import Sidebar from "./Sidebar";

const renderSidebar = (isOwner: boolean) => {
  auth.value = {
    user: { firstName: "Omar", lastName: "Ali", isOwner },
    logout: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <Sidebar isOpen onClose={() => undefined} />
    </MemoryRouter>,
  );
};

describe("Sidebar — Audit Log entry", () => {
  beforeEach(() => {
    auth.value = {};
  });

  it("shows the Audit Log link to the Owner, pointing at /dashboard/audit-log", () => {
    renderSidebar(true);

    const link = screen.getByRole("link", { name: /audit log/i });
    expect(link).toHaveAttribute("href", "/dashboard/audit-log");
  });

  it("hides it from everyone else", () => {
    renderSidebar(false);

    expect(
      screen.queryByRole("link", { name: /audit log/i }),
    ).not.toBeInTheDocument();
  });
});
