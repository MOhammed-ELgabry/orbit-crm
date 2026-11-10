import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../i18n";

const auth = vi.hoisted(() => ({ companyId: "c1" as string | null }));
const svc = vi.hoisted(() => ({
  getRegionalSettings: vi.fn(),
  getRegionalReference: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ company: auth.companyId ? { id: auth.companyId } : null }),
}));
vi.mock("../services/regionalService", () => svc);

import {
  invalidateRegionalSettings,
  useRegionalFormatters,
} from "./useRegionalSettings";

const legacy = {
  countryCode: null,
  baseCurrencyCode: null,
  timezone: null,
  defaultLocale: null,
  status: null,
  confirmedAt: null,
  suggestion: null,
};
const kuwait = {
  countryCode: "KW",
  baseCurrencyCode: "KWD",
  timezone: "Asia/Kuwait",
  defaultLocale: "ar-KW",
  status: "CONFIRMED",
  confirmedAt: "2026-11-09T10:00:00.000Z",
  suggestion: null,
};
const reference = {
  countries: [],
  currencies: [
    {
      code: "KWD",
      nameEn: "Kuwaiti Dinar",
      nameAr: "دينار",
      symbol: "KD",
      minorUnit: 3,
    },
  ],
};

describe("useRegionalFormatters", () => {
  beforeEach(() => {
    auth.companyId = "c1";
    svc.getRegionalSettings.mockReset();
    svc.getRegionalReference.mockReset().mockResolvedValue(reference);
    act(() => invalidateRegionalSettings());
  });

  it("keeps legacy output (no currency, no zone) for a company with nothing confirmed", async () => {
    svc.getRegionalSettings.mockResolvedValue(legacy);
    const { result } = renderHook(() => useRegionalFormatters());

    await waitFor(() => expect(svc.getRegionalSettings).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.currency).toBeNull();
    expect(result.current.companyTimeZone).toBeUndefined();
    expect(result.current.formatMoney("1234.50")).toBe(
      new Intl.NumberFormat(undefined).format(1234.5),
    );
    expect(svc.getRegionalReference).not.toHaveBeenCalled();
  });

  it("uses the confirmed base currency's minor unit (KWD = 3 decimals) and the company zone", async () => {
    svc.getRegionalSettings.mockResolvedValue(kuwait);
    const { result } = renderHook(() => useRegionalFormatters());

    await waitFor(() =>
      expect(result.current.currency).toEqual({ code: "KWD", minorUnit: 3 }),
    );

    expect(
      result.current.formatMoney("1.5").replace(/[\s\u00a0\u200e\u200f]/g, ""),
    ).toMatch(/KWD1\.500|1\.500KWD/);
    expect(result.current.companyTimeZone).toBe("Asia/Kuwait");
    expect(
      result.current.formatDateTime("2026-11-09T23:30:00.000Z", {
        zone: "company",
      }),
    ).not.toBe("");
  });

  it("falls back to legacy formatting when the settings request fails", async () => {
    svc.getRegionalSettings.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useRegionalFormatters());

    await act(async () => {});

    expect(result.current.currency).toBeNull();
    expect(result.current.formatMoney("10")).toBe("10");
  });

  it("does not fetch without a company (logged out)", async () => {
    auth.companyId = null;
    renderHook(() => useRegionalFormatters());
    await act(async () => {});

    expect(svc.getRegionalSettings).not.toHaveBeenCalled();
  });
});
