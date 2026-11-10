import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import {
  confirmRegionalSettings,
  getRegionalReference,
  getRegionalSettings,
  type RegionalReference,
  type RegionalSettings,
} from "../../services/regionalService";
import { confirmAlert } from "../../lib/swal";
import { notifyError, notifySuccess } from "../../lib/notify";
import { getErrorMessage } from "../../lib/errors";
import { invalidateRegionalSettings } from "../../hooks/useRegionalSettings";

const selectClass =
  "h-[38px] w-full rounded-[10px] bg-surface-muted px-3 text-sm text-gray-700 outline-none disabled:opacity-60";
const labelClass = "text-xs font-semibold text-gray-700";

interface FormState {
  countryCode: string;
  baseCurrencyCode: string;
  timezone: string;
  defaultLocale: string;
}

const EMPTY: FormState = {
  countryCode: "",
  baseCurrencyCode: "",
  timezone: "",
  defaultLocale: "",
};

function supportedZones(): string[] {
  try {
    const intl = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

function allTimezones(extra: string[]): string[] {
  return Array.from(
    new Set([...supportedZones(), ...extra.filter(Boolean)]),
  ).sort();
}

function localeLabel(tag: string, language: string): string {
  try {
    const name = new Intl.DisplayNames([language], { type: "language" }).of(
      tag,
    );
    return name && name !== tag ? `${name} (${tag})` : tag;
  } catch {
    return tag;
  }
}

function formFrom(settings: RegionalSettings): FormState {
  const s = settings.suggestion;
  // Confirmed values win; otherwise pre-fill the detection suggestion so the
  // Owner only has to review and confirm.
  return {
    countryCode: settings.countryCode ?? s?.countryCode ?? "",
    baseCurrencyCode: settings.baseCurrencyCode ?? s?.currencyCode ?? "",
    timezone: settings.timezone ?? s?.timezone ?? "",
    defaultLocale: settings.defaultLocale ?? s?.locale ?? "",
  };
}

const statusStyle: Record<string, string> = {
  DETECTED: "bg-sky-50 text-sky-700",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  NEEDS_REVIEW: "bg-amber-50 text-amber-700",
  NONE: "bg-slate-100 text-slate-600",
};

export default function RegionalSettingsSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.isOwner ?? false;
  const isArabic = i18n.language?.startsWith("ar");

  const [settings, setSettings] = useState<RegionalSettings | null>(null);
  const [reference, setReference] = useState<RegionalReference | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRegionalSettings(), getRegionalReference()])
      .then(([nextSettings, nextReference]) => {
        if (cancelled) return;
        setSettings(nextSettings);
        setReference(nextReference);
        setForm(formFrom(nextSettings));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const countries = useMemo(
    () =>
      [...(reference?.countries ?? [])].sort((a, b) =>
        (isArabic ? a.nameAr : a.nameEn).localeCompare(
          isArabic ? b.nameAr : b.nameEn,
          i18n.language,
        ),
      ),
    [reference, isArabic, i18n.language],
  );

  const locales = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(reference?.countries ?? []).map((c) => c.defaultLocale ?? ""),
            form.defaultLocale,
          ].filter(Boolean),
        ),
      ).sort(),
    [reference, form.defaultLocale],
  );

  const timezones = useMemo(
    () => allTimezones([form.timezone]),
    [form.timezone],
  );

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {t("regionalSettingsTitle")}
        </h2>
        <p className="mt-2 text-sm text-amber-600">{t("regionalLoadFailed")}</p>
      </div>
    );
  }

  if (!settings || !reference) {
    return <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const countryName = (code: string | null | undefined): string => {
    const c = reference.countries.find((x) => x.code === code);
    if (!c) return code ?? "";
    return isArabic ? c.nameAr : c.nameEn;
  };

  const statusKey = settings.status ?? "NONE";
  const suggestion = settings.suggestion;
  const needsReview = settings.status === "NEEDS_REVIEW";
  const complete =
    form.countryCode &&
    form.baseCurrencyCode &&
    form.timezone &&
    form.defaultLocale;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCountry = (code: string) => {
    const c = reference.countries.find((x) => x.code === code);
    // Country defaults are only a starting point; each field stays editable.
    setForm({
      countryCode: code,
      baseCurrencyCode: c?.defaultCurrencyCode ?? form.baseCurrencyCode,
      timezone: c?.defaultTimezone ?? form.timezone,
      defaultLocale: c?.defaultLocale ?? form.defaultLocale,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isOwner || isSaving || !complete) return;

    const changingCurrency =
      !!settings.baseCurrencyCode &&
      settings.baseCurrencyCode !== form.baseCurrencyCode;

    if (changingCurrency) {
      const ok = await confirmAlert({
        title: t("regionalCurrencyChangeTitle"),
        text: t("regionalCurrencyChangeText"),
        confirmButtonText: t("regionalCurrencyChangeConfirm"),
        cancelButtonText: t("cancel"),
      });
      if (!ok) return;
    }

    setIsSaving(true);
    try {
      const next = await confirmRegionalSettings({
        ...form,
        ...(changingCurrency ? { acknowledgeCurrencyChange: true } : {}),
      });
      setSettings(next);
      setForm(formFrom(next));
      invalidateRegionalSettings();
      notifySuccess({ title: t("regionalSaved") });
    } catch (error) {
      notifyError({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {t("regionalSettingsTitle")}
        </h2>
        <span
          data-testid="regional-status"
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyle[statusKey]}`}
        >
          {t(`regionalStatus${statusKey}`)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{t("regionalSettingsIntro")}</p>

      {!isOwner && (
        <p className="mt-1 text-xs text-amber-600">{t("ownerOnlyNotice")}</p>
      )}

      {isOwner && suggestion && (
        <div className="mt-3 rounded-[10px] bg-surface-muted p-3 text-xs text-gray-700">
          <p className="font-semibold">{t("regionalDetectionLabel")}</p>
          {suggestion.countryCode ? (
            <>
              <p className="mt-1" data-testid="regional-suggestion">
                {t("regionalSuggestionLine", {
                  country: countryName(suggestion.countryCode),
                  currency: suggestion.currencyCode ?? "—",
                  timezone: suggestion.timezone ?? "—",
                })}
              </p>
              <p className="mt-0.5 text-gray-500">
                {suggestion.source && t(`regionalSource${suggestion.source}`)}
                {suggestion.source && suggestion.confidence ? " · " : ""}
                {suggestion.confidence &&
                  t(`regionalConfidence${suggestion.confidence}`)}
              </p>
              {suggestion.source === "IP" && (
                <a
                  href="https://db-ip.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-gray-500 underline"
                >
                  {t("regionalIpAttribution")}
                </a>
              )}
            </>
          ) : (
            <p className="mt-1 text-gray-500">{t("regionalNoSuggestion")}</p>
          )}
          {needsReview && (
            <p className="mt-1 text-amber-600">
              {t("regionalNeedsReviewNotice")}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <fieldset disabled={!isOwner} className="contents">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="regional-country" className={labelClass}>
                {t("regionalCountryLabel")}
              </label>
              <select
                id="regional-country"
                className={selectClass}
                value={form.countryCode}
                onChange={(e) => handleCountry(e.target.value)}
              >
                <option value="">{t("regionalSelectPlaceholder")}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {isArabic ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label htmlFor="regional-currency" className={labelClass}>
                {t("regionalCurrencyLabel")}
              </label>
              <select
                id="regional-currency"
                className={selectClass}
                value={form.baseCurrencyCode}
                onChange={(e) => set("baseCurrencyCode", e.target.value)}
              >
                <option value="">{t("regionalSelectPlaceholder")}</option>
                {reference.currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {isArabic ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label htmlFor="regional-timezone" className={labelClass}>
                {t("regionalTimezoneLabel")}
              </label>
              <select
                id="regional-timezone"
                dir="ltr"
                className={selectClass}
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
              >
                <option value="">{t("regionalSelectPlaceholder")}</option>
                {timezones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label htmlFor="regional-locale" className={labelClass}>
                {t("regionalLocaleLabel")}
              </label>
              <select
                id="regional-locale"
                className={selectClass}
                value={form.defaultLocale}
                onChange={(e) => set("defaultLocale", e.target.value)}
              >
                <option value="">{t("regionalSelectPlaceholder")}</option>
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {localeLabel(l, i18n.language)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {isOwner && (
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving || !complete}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isSaving ? t("saving") : t("regionalConfirm")}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
