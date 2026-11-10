import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type { RegionalHintsPayload } from "../lib/regional/hints";

export type RegionalStatus = "DETECTED" | "CONFIRMED" | "NEEDS_REVIEW";
export type RegionalSource = "GEOLOCATION" | "IP" | "TIMEZONE" | "LOCALE";
export type RegionalConfidence = "HIGH" | "MEDIUM" | "LOW" | "AMBIGUOUS";

/** Mirrors backend RegionalSettingsView (regional-settings.service.ts). */
export interface RegionalSettings {
  countryCode: string | null;
  baseCurrencyCode: string | null;
  timezone: string | null;
  defaultLocale: string | null;
  /** null = legacy company: nothing detected and nothing confirmed. */
  status: RegionalStatus | null;
  confirmedAt: string | null;
  /** Owner only. Detection result, never an authority. */
  suggestion: {
    countryCode: string | null;
    currencyCode: string | null;
    timezone: string | null;
    locale: string | null;
    source: RegionalSource | null;
    confidence: RegionalConfidence | null;
    detectedAt: string | null;
  } | null;
}

export interface RegionalCountry {
  code: string;
  nameEn: string;
  nameAr: string;
  nativeName: string | null;
  defaultCurrencyCode: string | null;
  defaultLocale: string | null;
  defaultTimezone: string | null;
}

export interface RegionalCurrency {
  code: string;
  nameEn: string;
  nameAr: string;
  symbol: string | null;
  minorUnit: number;
}

export interface RegionalReference {
  countries: RegionalCountry[];
  currencies: RegionalCurrency[];
}

export interface ConfirmRegionalSettingsInput {
  countryCode: string;
  baseCurrencyCode: string;
  timezone: string;
  defaultLocale: string;
  acknowledgeCurrencyChange?: boolean;
}

export const getRegionalReference = async (): Promise<RegionalReference> => {
  const response = await api.get<ApiEnvelope<RegionalReference>>(
    "/regional/reference",
  );
  return response.data.data;
};

export const getRegionalSettings = async (): Promise<RegionalSettings> => {
  const response =
    await api.get<ApiEnvelope<RegionalSettings>>("/regional/settings");
  return response.data.data;
};

/** Owner-only server-side (OwnerGuard + CSRF). */
export const confirmRegionalSettings = async (
  input: ConfirmRegionalSettingsInput,
): Promise<RegionalSettings> => {
  const response = await api.put<ApiEnvelope<RegionalSettings>>(
    "/regional/settings",
    input,
  );
  return response.data.data;
};

/**
 * Social sign-in: the hints are validated server-side and swapped for an
 * opaque single-use token (never put hint data in a URL). Resolves to null on
 * ANY failure — hints must never block sign-in.
 */
export const createRegionalHandoff = async (
  hints: RegionalHintsPayload,
): Promise<string | null> => {
  try {
    const response = await api.post<ApiEnvelope<{ token: string | null }>>(
      "/regional/handoff",
      { hints },
    );
    return response.data.data?.token ?? null;
  } catch {
    return null;
  }
};
