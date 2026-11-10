import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "i18next";
import "../../i18n";

const auth = vi.hoisted(() => ({ isOwner: true }));
const svc = vi.hoisted(() => ({
  getRegionalSettings: vi.fn(),
  getRegionalReference: vi.fn(),
  confirmRegionalSettings: vi.fn(),
}));
const confirmAlert = vi.hoisted(() => vi.fn());

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { isOwner: auth.isOwner }, company: { id: "c1" } }),
}));
vi.mock("../../services/regionalService", () => svc);
vi.mock("../../lib/swal", () => ({ confirmAlert }));
vi.mock("../../lib/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

import RegionalSettingsSection from "./RegionalSettingsSection";

const reference = {
  countries: [
    {
      code: "EG",
      nameEn: "Egypt",
      nameAr: "مصر",
      nativeName: "مصر",
      defaultCurrencyCode: "EGP",
      defaultLocale: "ar-EG",
      defaultTimezone: "Africa/Cairo",
    },
    {
      code: "KW",
      nameEn: "Kuwait",
      nameAr: "الكويت",
      nativeName: "الكويت",
      defaultCurrencyCode: "KWD",
      defaultLocale: "ar-KW",
      defaultTimezone: "Asia/Kuwait",
    },
  ],
  currencies: [
    {
      code: "EGP",
      nameEn: "Egyptian Pound",
      nameAr: "جنيه مصري",
      symbol: "E£",
      minorUnit: 2,
    },
    {
      code: "KWD",
      nameEn: "Kuwaiti Dinar",
      nameAr: "دينار كويتي",
      symbol: "KD",
      minorUnit: 3,
    },
  ],
};

const detected = {
  countryCode: null,
  baseCurrencyCode: null,
  timezone: null,
  defaultLocale: null,
  status: "NEEDS_REVIEW" as const,
  confirmedAt: null,
  suggestion: {
    countryCode: "EG",
    currencyCode: "EGP",
    timezone: "Africa/Cairo",
    locale: "ar-EG",
    source: "IP" as const,
    confidence: "LOW" as const,
    detectedAt: "2026-11-09T10:00:00.000Z",
  },
};

const confirmed = {
  countryCode: "EG",
  baseCurrencyCode: "EGP",
  timezone: "Africa/Cairo",
  defaultLocale: "ar-EG",
  status: "CONFIRMED" as const,
  confirmedAt: "2026-11-09T11:00:00.000Z",
  suggestion: null,
};

describe("RegionalSettingsSection", () => {
  beforeEach(async () => {
    auth.isOwner = true;
    svc.getRegionalReference.mockResolvedValue(reference);
    svc.getRegionalSettings.mockResolvedValue(detected);
    svc.confirmRegionalSettings.mockReset();
    confirmAlert.mockReset();
    await i18n.changeLanguage("en");
  });

  it("shows detection source, confidence, status and pre-fills the suggestion for the Owner", async () => {
    render(<RegionalSettingsSection />);

    expect(await screen.findByTestId("regional-status")).toHaveTextContent(
      "Needs review",
    );
    expect(screen.getByTestId("regional-suggestion")).toHaveTextContent(
      "Suggested: Egypt · EGP · Africa/Cairo",
    );
    expect(
      screen.getByText(/Network \(IP\) country · Low confidence/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DB-IP/ })).toHaveAttribute(
      "href",
      "https://db-ip.com",
    );
    expect(screen.getByLabelText("Company country")).toHaveValue("EG");
    expect(screen.getByLabelText("Base currency")).toHaveValue("EGP");
  });

  it("confirms with the four chosen values and no acknowledge flag for a first confirmation", async () => {
    svc.confirmRegionalSettings.mockResolvedValue(confirmed);
    render(<RegionalSettingsSection />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Confirm settings" }),
    );

    await waitFor(() =>
      expect(svc.confirmRegionalSettings).toHaveBeenCalledWith({
        countryCode: "EG",
        baseCurrencyCode: "EGP",
        timezone: "Africa/Cairo",
        defaultLocale: "ar-EG",
      }),
    );
    expect(await screen.findByTestId("regional-status")).toHaveTextContent(
      "Confirmed",
    );
    expect(confirmAlert).not.toHaveBeenCalled();
  });

  it("selecting another country re-fills currency, timezone and locale defaults", async () => {
    render(<RegionalSettingsSection />);
    const country = await screen.findByLabelText("Company country");

    await userEvent.selectOptions(country, "KW");

    expect(screen.getByLabelText("Base currency")).toHaveValue("KWD");
    expect(screen.getByLabelText("Company timezone")).toHaveValue(
      "Asia/Kuwait",
    );
    expect(screen.getByLabelText("Default locale")).toHaveValue("ar-KW");
  });

  it("asks before changing an existing base currency and sends the acknowledgement", async () => {
    svc.getRegionalSettings.mockResolvedValue(confirmed);
    svc.confirmRegionalSettings.mockResolvedValue({
      ...confirmed,
      baseCurrencyCode: "KWD",
    });
    confirmAlert.mockResolvedValue(true);
    render(<RegionalSettingsSection />);

    await userEvent.selectOptions(
      await screen.findByLabelText("Base currency"),
      "KWD",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm settings" }),
    );

    expect(confirmAlert).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(svc.confirmRegionalSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          baseCurrencyCode: "KWD",
          acknowledgeCurrencyChange: true,
        }),
      ),
    );
  });

  it("does nothing when the Owner cancels the currency-change prompt", async () => {
    svc.getRegionalSettings.mockResolvedValue(confirmed);
    confirmAlert.mockResolvedValue(false);
    render(<RegionalSettingsSection />);

    await userEvent.selectOptions(
      await screen.findByLabelText("Base currency"),
      "KWD",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm settings" }),
    );

    expect(svc.confirmRegionalSettings).not.toHaveBeenCalled();
  });

  it("is read-only for non-owners: no save button, disabled fields, no detection data", async () => {
    auth.isOwner = false;
    svc.getRegionalSettings.mockResolvedValue({ ...confirmed });
    render(<RegionalSettingsSection />);

    const country = await screen.findByLabelText("Company country");
    expect(country).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Confirm settings" }),
    ).toBeNull();
    expect(screen.queryByTestId("regional-suggestion")).toBeNull();
    expect(screen.getByText(/Only the account owner/)).toBeInTheDocument();
  });

  it("shows 'Not set' for a legacy company and never invents a currency", async () => {
    svc.getRegionalSettings.mockResolvedValue({
      ...detected,
      status: null,
      suggestion: null,
    });
    render(<RegionalSettingsSection />);

    expect(await screen.findByTestId("regional-status")).toHaveTextContent(
      "Not set",
    );
    expect(screen.getByLabelText("Base currency")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Confirm settings" }),
    ).toBeDisabled();
  });

  it("renders Arabic labels and Arabic country names, with an LTR timezone field", async () => {
    await i18n.changeLanguage("ar");
    render(<RegionalSettingsSection />);

    expect(await screen.findByLabelText("دولة الشركة")).toHaveValue("EG");
    const options = within(screen.getByLabelText("دولة الشركة")).getAllByRole(
      "option",
    );
    expect(options.map((o) => o.textContent)).toContain("مصر");
    expect(screen.getByLabelText("المنطقة الزمنية للشركة")).toHaveAttribute(
      "dir",
      "ltr",
    );
    expect(screen.getByTestId("regional-status")).toHaveTextContent(
      "تحتاج مراجعة",
    );
  });

  it("uses a single column on mobile and two from sm (responsive grid)", async () => {
    const { container } = render(<RegionalSettingsSection />);
    await screen.findByLabelText("Company country");

    expect(
      container.querySelector(".grid-cols-1.sm\\:grid-cols-2"),
    ).not.toBeNull();
  });

  it("shows a calm message when settings cannot be loaded", async () => {
    svc.getRegionalSettings.mockRejectedValue(new Error("boom"));
    render(<RegionalSettingsSection />);

    expect(
      await screen.findByText("Couldn't load regional settings."),
    ).toBeInTheDocument();
  });
});
