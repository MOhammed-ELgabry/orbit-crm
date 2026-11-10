import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const regional = vi.hoisted(() => ({
  currency: null as { code: string; minorUnit: number } | null,
}));

vi.mock("../../hooks/useRegionalSettings", () => ({
  useRegionalFormatters: () => ({ currency: regional.currency }),
}));
vi.mock("../../services/userService", () => ({
  listTeamMembers: vi.fn().mockResolvedValue({ members: [] }),
}));
vi.mock("../../services/contactService", () => ({
  listContacts: vi.fn().mockResolvedValue({ contacts: [] }),
}));
vi.mock("../../services/leadService", () => ({
  listLeads: vi.fn().mockResolvedValue({ leads: [] }),
}));
vi.mock("../../lib/notify", () => ({ notifyError: vi.fn() }));

import DealFormModal from "./DealFormModal";

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<DealFormModal onSubmit={onSubmit} onClose={onClose} />);
  const field = (label: string) =>
    screen.getByText(label).parentElement!.querySelector("input")!;
  return { onSubmit, onClose, field };
}

async function fill(field: (l: string) => HTMLInputElement, amount: string) {
  await userEvent.type(field("Title"), "Big deal");
  if (amount) await userEvent.type(field("Amount"), amount);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("DealFormModal amount", () => {
  beforeEach(() => {
    regional.currency = null;
  });

  it("sends the amount as an exact decimal STRING, never a JS number", async () => {
    const { onSubmit, field } = setup();

    await fill(field, "12345678901234.5678");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].amount).toBe("12345678901234.5678");
    expect(typeof onSubmit.mock.calls[0][0].amount).toBe("string");
  });

  it("reads Arabic digits and the Arabic decimal mark", async () => {
    const { onSubmit, field } = setup();

    await fill(field, "١٢٥٠٫٥٠");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].amount).toBe("1250.50");
  });

  it("omits the amount when left empty (old behaviour)", async () => {
    const { onSubmit, field } = setup();

    await fill(field, "");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("amount");
  });

  it("blocks an unreadable amount and shows why", async () => {
    const { onSubmit, field } = setup();

    await fill(field, "12abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid amount/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses more decimals than the base currency allows instead of rounding", async () => {
    regional.currency = { code: "EGP", minorUnit: 2 };
    const { onSubmit, field } = setup();

    await fill(field, "10.005");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /at most 2 decimal/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts 3 decimals for a 3-decimal currency (KWD)", async () => {
    regional.currency = { code: "KWD", minorUnit: 3 };
    const { onSubmit, field } = setup();

    await fill(field, "10.005");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].amount).toBe("10.005");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
