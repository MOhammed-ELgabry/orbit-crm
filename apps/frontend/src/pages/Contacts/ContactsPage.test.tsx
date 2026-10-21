import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  listContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
}));
const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("../../services/contactService", () => ({
  listContacts: svc.listContacts,
  createContact: svc.createContact,
  updateContact: svc.updateContact,
  deleteContact: svc.deleteContact,
  contactDisplayName: (c: { firstName: string; lastName: string }) =>
    `${c.firstName} ${c.lastName}`.trim(),
}));
vi.mock("../../lib/swal", () => ({
  confirmAlert: vi.fn(),
  errorAlert: vi.fn(),
}));
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    company: { businessType: "medical_clinics" },
    hasPermission: (permission: string) => auth.permissions.has(permission),
  }),
}));

import "../../i18n";
import ContactsPage from "./ContactsPage";

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard/contacts"]}>
      <Location />
      <Routes>
        <Route path="/dashboard/contacts" element={<ContactsPage />} />
        <Route
          path="/dashboard/contacts/import"
          element={<div>import page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.permissions = new Set();
  svc.listContacts.mockResolvedValue({
    contacts: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
});

describe("ContactsPage — import entry point", () => {
  it("hides the Import button without contact:create", async () => {
    renderPage();
    await waitFor(() => expect(svc.listContacts).toHaveBeenCalled());

    expect(
      screen.queryByRole("button", { name: "Import" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Import button with contact:create and opens the import page", async () => {
    auth.permissions = new Set(["contact:create"]);
    renderPage();
    await waitFor(() => expect(svc.listContacts).toHaveBeenCalled());

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/contacts/import",
    );
  });
});
