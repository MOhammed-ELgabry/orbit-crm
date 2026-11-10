import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import {
  getRegionalReference,
  getRegionalSettings,
  type RegionalSettings,
} from "../services/regionalService";
import {
  formatDateTime,
  formatMoneyString,
  regionalLocale,
  type MoneyCurrency,
} from "../lib/regional/format";

/**
 * Company regional settings shared by every formatter. One fetch per company
 * per session (re-fetched after the Owner confirms new settings). While
 * loading, or for a legacy company that never confirmed anything, consumers
 * get the confirmed fields as null and must keep their legacy behaviour.
 */
interface CacheEntry {
  companyId: string;
  value: RegionalSettings | null;
  /** Minor unit of the confirmed base currency (from the reference table). */
  currency: MoneyCurrency | null;
  promise: Promise<void> | null;
}

let cache: CacheEntry | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function invalidateRegionalSettings(): void {
  cache = null;
  notify();
}

function load(companyId: string): void {
  if (cache?.companyId === companyId) return;

  const entry: CacheEntry = {
    companyId,
    value: null,
    currency: null,
    promise: null,
  };
  cache = entry;
  entry.promise = getRegionalSettings()
    .then(async (value) => {
      entry.value = value;
      if (value.baseCurrencyCode) {
        // Without the minor unit we cannot format safely: stay legacy.
        const reference = await getRegionalReference().catch(() => null);
        const found = reference?.currencies.find(
          (c) => c.code === value.baseCurrencyCode,
        );
        entry.currency = found
          ? { code: found.code, minorUnit: found.minorUnit }
          : null;
      }
    })
    .catch(() => {
      // Leave null: formatting falls back to legacy behaviour.
    })
    .finally(() => {
      entry.promise = null;
      if (cache === entry) notify();
    });
}

export function useRegionalSettings(): RegionalSettings | null {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (companyId) load(companyId);
  }, [companyId, cache]); // eslint-disable-line react-hooks/exhaustive-deps

  return companyId && cache?.companyId === companyId ? cache.value : null;
}

export interface RegionalFormatters {
  /** Confirmed base currency, or null (legacy / not loaded yet). */
  currency: MoneyCurrency | null;
  /** Display locale (UI language + company country), undefined = browser default. */
  locale: string | undefined;
  /** Company timezone, or undefined (legacy / not loaded). */
  companyTimeZone: string | undefined;
  /** Decimal string -> display string, with the base currency when known. */
  formatMoney: (amount: string, options?: { showCurrency?: boolean }) => string;
  /** Viewer's own zone by default; pass `zone: "company"` for the company zone. */
  formatDateTime: (
    value: string | Date,
    options?: {
      zone?: "user" | "company";
      dateStyle?: "short" | "medium" | "long";
    },
  ) => string;
}

/**
 * Everything a component needs to show money and times consistently.
 * Legacy companies (nothing confirmed) get exactly the pre-regional output.
 */
export function useRegionalFormatters(): RegionalFormatters {
  const settings = useRegionalSettings();
  const { i18n } = useTranslation();
  const currency = cache?.currency ?? null;
  const country = settings?.countryCode ?? null;
  const locale = regionalLocale(i18n.language, country);
  const companyTimeZone = settings?.timezone ?? undefined;

  return {
    currency,
    locale,
    companyTimeZone,
    formatMoney: (amount, options) =>
      formatMoneyString(amount, {
        locale,
        currency,
        showCurrency: options?.showCurrency,
      }),
    formatDateTime: (value, options) =>
      formatDateTime(value, {
        locale: locale ?? i18n.language,
        timeZone: options?.zone === "company" ? companyTimeZone : undefined,
        dateStyle: options?.dateStyle,
      }),
  };
}
