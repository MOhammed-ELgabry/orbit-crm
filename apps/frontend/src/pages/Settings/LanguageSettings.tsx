import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import { updateLanguage } from "../../services/settingsService";
import { successAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

const labelClass = "text-xs font-semibold text-gray-700";

const LANGUAGE_OPTIONS: { value: "ar" | "en"; nativeLabel: string }[] = [
  { value: "ar", nativeLabel: "العربية" },
  { value: "en", nativeLabel: "English" },
];

/**
 * The only language selector in the application — see App.tsx, where
 * the old always-visible LanguageSwitcher used to float on every page.
 * Explicit Save only: picking a language here just updates local state
 * for the radio group and preview; nothing is sent to the backend (and
 * the active interface language doesn't change) until Save succeeds.
 */
export default function LanguageSettings() {
  const { t } = useTranslation();
  const { user, updateUserSettings } = useAuth();
  const [selected, setSelected] = useState<"ar" | "en">(user?.language ?? "en");
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const isUnchanged = selected === user.language;

  const handleSave = async () => {
    if (isSaving || isUnchanged) return;

    setIsSaving(true);
    try {
      await updateLanguage(user.id, selected);
      updateUserSettings({ language: selected });
      trackEvent("settings_language_changed", { language: selected });

      successAlert({ title: t("settingsSaved") });
    } catch (error) {
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <h2 className="font-nunito text-base font-semibold text-slate-800">
        {t("languageSettingsTitle")}
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        {t("languageSettingsDescription")}
      </p>

      <fieldset className="mt-4">
        <legend className={labelClass}>{t("currentLanguageLabel")}</legend>

        <div
          role="radiogroup"
          aria-label={t("currentLanguageLabel")}
          className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const isSelected = selected === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(option.value)}
                className={`flex h-[42px] w-full items-center justify-center rounded-[10px] border px-3 text-sm font-medium transition-colors ${
                  isSelected
                    ? "border-[#605BFF] bg-[#605BFF]/10 text-[#605BFF]"
                    : "border-transparent bg-[#F7F7F8] text-gray-700 hover:bg-[#eeeef1]"
                }`}
              >
                {option.nativeLabel}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isUnchanged}
          className="rounded-lg bg-[#605BFF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
        >
          {isSaving ? t("saving") : t("saveLanguage")}
        </button>
      </div>
    </div>
  );
}
