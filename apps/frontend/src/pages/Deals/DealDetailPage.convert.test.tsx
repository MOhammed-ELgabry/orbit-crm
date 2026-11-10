/**
 * Where the "Convert lead to contact" action appears on the deal page:
 * only for a WON deal that has a lead which is not yet converted, and only
 * for a user holding all three permissions the backend requires. (The
 * backend stays the authority; this pins that the UI never offers a
 * button that would be refused, nor a second conversion.)
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";
import i18n from "i18next";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  getDeal: vi.fn(),
  getLead: vi.fn(),
  getContact: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    hasPermission: (p: string) => mocks.permissions.has(p),
  }),
}));
vi.mock("../../services/dealService", () => ({
  getDeal: mocks.getDeal,
  updateDeal: vi.fn(),
  deleteDeal: vi.fn(),
}));
vi.mock("../../services/leadService", () => ({ getLead: mocks.getLead }));
vi.mock("../../services/contactService", () => ({
  getContact: mocks.getContact,
}));
vi.mock("../../services/userService", () => ({
  listTeamMembers: () => Promise.resolve({ members: [] }),
}));
vi.mock("../../Components/LeadConversion/ConvertLeadModal", () => ({
  default: () => <div data-testid="convert-modal" />,
}));
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));

import DealDetailPage from "./DealDetailPage";

const deal = (over = {}) => ({
  id: "d1",
  companyId: "c",
  title: "Big deal",
  amount: "100",
  stage: "closed_won",
  notes: null,
  expectedCloseDate: null,
  contactId: null,
  leadId: "l1",
  assignedToId: null,
  ...over,
});

const lead = (over = {}) => ({
  id: "l1",
  firstName: "Lena",
  lastName: "Lead",
  convertedAt: null,
  convertedContactId: null,
  ...over,
});

const ALL = ["deal:update", "lead:update", "contact:create"];

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/dashboard/deals/d1"]}>
      <Routes>
        <Route path="/dashboard/deals/:id" element={<DealDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const actionName = /Convert lead to contact/;

describe("DealDetailPage — convert lead action", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.permissions = new Set(ALL);
    mocks.getDeal.mockReset().mockResolvedValue(deal());
    mocks.getLead.mockReset().mockResolvedValue(lead());
    mocks.getContact
      .mockReset()
      .mockResolvedValue({ firstName: "A", lastName: "B" });
  });

  it("is offered for a won deal with an unconverted lead and opens the dialog", async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole(
        "button",
        { name: actionName },
        { timeout: 5000 },
      ),
    );
    expect(screen.getByTestId("convert-modal")).toBeInTheDocument();
  });

  it.each(ALL)("is hidden without %s", async (missing) => {
    mocks.permissions = new Set(ALL.filter((p) => p !== missing));
    renderPage();
    await screen.findByText("Big deal");
    await screen.findByText(/Lena Lead/);
    expect(screen.queryByRole("button", { name: actionName })).toBeNull();
  });

  it("is hidden for a deal that is not won", async () => {
    mocks.getDeal.mockResolvedValue(deal({ stage: "negotiation" }));
    renderPage();
    await screen.findByText(/Lena Lead/);
    expect(screen.queryByRole("button", { name: actionName })).toBeNull();
  });

  it("is hidden for a deal without a lead", async () => {
    mocks.getDeal.mockResolvedValue(deal({ leadId: null }));
    renderPage();
    await screen.findByText("Big deal");
    expect(screen.queryByRole("button", { name: actionName })).toBeNull();
  });

  it("an already-converted lead shows the state and a link to its contact instead of the action", async () => {
    mocks.getLead.mockResolvedValue(
      lead({ convertedAt: "2026-11-07T10:00:00Z", convertedContactId: "c9" }),
    );
    renderPage();
    await screen.findByText("Lead already converted");
    expect(screen.queryByRole("button", { name: actionName })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open contact" }),
    ).toBeInTheDocument();
  });
});
