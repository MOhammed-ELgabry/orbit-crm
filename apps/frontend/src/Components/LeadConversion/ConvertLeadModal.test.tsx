/**
 * The conversion dialog: shows the server's preview, lets the user pick
 * create / link, and sends ONLY the user's decision. Eligibility and duplicate
 * rules are decided by the backend; these tests pin how the dialog reflects
 * them (what is disabled, what is sent, what happens on failure).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";
import i18n from "i18next";

import type {
  ConversionCandidate,
  LeadConversionPreview,
} from "../../types/leadConversion";

const service = vi.hoisted(() => ({
  previewLeadConversion: vi.fn(),
  convertLead: vi.fn(),
}));
vi.mock("../../services/leadConversionService", () => service);

import ConvertLeadModal from "./ConvertLeadModal";

const candidate = (
  over: Partial<ConversionCandidate> = {},
): ConversionCandidate => ({
  contactId: "c1",
  firstName: "Sara",
  lastName: "Existing",
  email: "sara@x.com",
  phone: null,
  mobile: null,
  organizationName: null,
  status: "active",
  matchedOn: ["email"],
  ...over,
});

const preview = (
  over: Partial<LeadConversionPreview> = {},
): LeadConversionPreview => ({
  eligible: true,
  reason: null,
  alreadyConverted: null,
  deal: {
    id: "d1",
    title: "Big deal",
    stage: "closed_won",
    contactId: null,
    leadId: "l1",
  },
  lead: {
    id: "l1",
    firstName: "Lena",
    lastName: "Lead",
    email: "lena@x.com",
    phone: "0100",
    organizationName: "Acme",
    source: "web",
    status: "qualified",
    notes: null,
  },
  proposedContact: {
    firstName: "Lena",
    lastName: "Lead",
    email: "lena@x.com",
    phone: "0100",
    organizationName: "Acme",
    source: "web",
    notes: null,
    status: "customer",
    assignedToId: null,
  },
  candidates: [],
  duplicate: { blocksCreate: false, requiresAcknowledgement: false },
  ...over,
});

const result = (over = {}) => ({
  outcome: "created" as const,
  contactId: "new-c",
  leadId: "l1",
  dealId: "d1",
  relinked: { deals: 0, tasks: 0, calendarEvents: 0 },
  ...over,
});

function renderModal(
  props: Partial<Parameters<typeof ConvertLeadModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onConverted = vi.fn();
  render(
    <ConvertLeadModal
      dealId="d1"
      dealTitle="Big deal"
      onClose={onClose}
      onConverted={onConverted}
      {...props}
    />,
  );
  return { onClose, onConverted };
}

const confirmButton = () => screen.getByRole("button", { name: /^Convert$/ });

describe("ConvertLeadModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    service.previewLeadConversion.mockReset();
    service.convertLead.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("is read-only until the user confirms: loading the preview calls no write", async () => {
    service.previewLeadConversion.mockResolvedValue(preview());
    renderModal();
    await screen.findByText(/Create a new contact from this lead/);
    expect(service.previewLeadConversion).toHaveBeenCalledWith("d1");
    expect(service.convertLead).not.toHaveBeenCalled();
  });

  it("sends exactly { resolution: 'create' } on confirm (no lead data from the client)", async () => {
    service.previewLeadConversion.mockResolvedValue(preview());
    service.convertLead.mockResolvedValue(result());
    const { onConverted } = renderModal();

    await userEvent.click(
      await screen.findByRole("button", { name: /^Convert$/ }),
    );

    await waitFor(() => expect(onConverted).toHaveBeenCalledWith(result()));
    expect(service.convertLead).toHaveBeenCalledTimes(1);
    expect(service.convertLead).toHaveBeenCalledWith("d1", {
      resolution: "create",
    });
  });

  it("an email match disables 'create', explains why and preselects linking", async () => {
    service.previewLeadConversion.mockResolvedValue(
      preview({
        candidates: [candidate()],
        duplicate: { blocksCreate: true, requiresAcknowledgement: false },
      }),
    );
    service.convertLead.mockResolvedValue(
      result({ outcome: "linked", contactId: "c1" }),
    );
    renderModal();

    await screen.findByText(/same email already exists/i);
    const create = screen.getByRole("radio", { name: /Create a new contact/ });
    expect(create).toBeDisabled();
    expect(
      screen.getByRole("radio", { name: /Link to an existing contact/ }),
    ).toBeChecked();

    await userEvent.click(confirmButton());
    await waitFor(() =>
      expect(service.convertLead).toHaveBeenCalledWith("d1", {
        resolution: "link",
        contactId: "c1",
      }),
    );
  });

  it("a phone-only match needs the acknowledgement before 'Convert' is enabled, and sends it", async () => {
    service.previewLeadConversion.mockResolvedValue(
      preview({
        candidates: [
          candidate({ matchedOn: ["phone"], email: null, phone: "0100" }),
        ],
        duplicate: { blocksCreate: false, requiresAcknowledgement: true },
      }),
    );
    service.convertLead.mockResolvedValue(result());
    renderModal();

    await screen.findByText(/Create a new contact from this lead/);
    expect(confirmButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(confirmButton()).toBeEnabled();

    await userEvent.click(confirmButton());
    await waitFor(() =>
      expect(service.convertLead).toHaveBeenCalledWith("d1", {
        resolution: "create",
        acknowledgeDuplicate: true,
      }),
    );
  });

  it("when the deal already has a contact, only that contact can be linked", async () => {
    service.previewLeadConversion.mockResolvedValue(
      preview({
        candidates: [
          candidate({ contactId: "own", matchedOn: ["deal"] }),
          candidate({
            contactId: "other",
            firstName: "Other",
            matchedOn: ["email"],
          }),
        ],
        duplicate: { blocksCreate: true, requiresAcknowledgement: false },
      }),
    );
    renderModal();

    await screen.findByText(/This deal already has a contact/);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveValue("own");
  });

  it("explains an ineligible deal and offers no confirmation", async () => {
    service.previewLeadConversion.mockResolvedValue(
      preview({
        eligible: false,
        reason: "deal_not_won",
        lead: null,
        proposedContact: null,
      }),
    );
    renderModal();

    await screen.findByText(/Only a deal in the Closed Won stage/);
    expect(confirmButton()).toBeDisabled();
  });

  it("an already-converted lead cannot be converted again and offers the contact", async () => {
    service.previewLeadConversion.mockResolvedValue(
      preview({
        eligible: false,
        alreadyConverted: {
          contactId: "c9",
          convertedAt: "2026-11-07T10:00:00Z",
        },
      }),
    );
    const onOpenContact = vi.fn();
    renderModal({ onOpenContact });

    await screen.findByText(/already converted/i);
    expect(confirmButton()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Open contact/ }));
    expect(onOpenContact).toHaveBeenCalledWith("c9");
  });

  it("a failed conversion keeps the dialog open, shows the server message and re-reads the preview", async () => {
    service.previewLeadConversion.mockResolvedValue(preview());
    service.convertLead.mockRejectedValue(
      new Error("A contact with the same email already exists."),
    );
    const { onConverted } = renderModal();

    await userEvent.click(
      await screen.findByRole("button", { name: /^Convert$/ }),
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A contact with the same email already exists.",
    );
    expect(onConverted).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(service.previewLeadConversion).toHaveBeenCalledTimes(2),
    );
  });

  it("ignores a second click while the request is in flight (no double conversion)", async () => {
    service.previewLeadConversion.mockResolvedValue(preview());
    let resolve!: (v: ReturnType<typeof result>) => void;
    service.convertLead.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderModal();

    const button = await screen.findByRole("button", { name: /^Convert$/ });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: /Converting/ }));

    expect(service.convertLead).toHaveBeenCalledTimes(1);
    resolve(result());
  });

  it("renders in Arabic", async () => {
    await i18n.changeLanguage("ar");
    service.previewLeadConversion.mockResolvedValue(preview());
    renderModal();
    expect(await screen.findByRole("button", { name: "تحويل" })).toBeEnabled();
    await i18n.changeLanguage("en");
  });
});
