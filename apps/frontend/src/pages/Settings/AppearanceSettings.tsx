import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import { updateAppearance } from "../../services/settingsService";
import { getForegroundColor } from "../../lib/contrast";
import { successAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

const labelClass = "text-xs font-semibold text-gray-700";

/** Matches DashboardLayout's existing hardcoded canvas color — the value
 * this page falls back to when the user has no saved preference yet. */
const DEFAULT_BACKGROUND = "#F6F8FC";

/**
 * The user only ever picks a background color. The foreground/text color
 * shown in the preview (and applied app-wide on save) is always
 * calculated from it via getForegroundColor — never a separate choice,
 * never persisted. Changing the color here only updates local draft
 * state for the preview; the main app canvas (see DashboardLayout) does
 * not change until Save succeeds.
 */
export default function AppearanceSettings() {
  const { t } = useTranslation();
  const { user, updateUserSettings } = useAuth();
  const [draftColor, setDraftColor] = useState(
    user?.backgroundColor ?? DEFAULT_BACKGROUND,
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const savedColor = user.backgroundColor ?? DEFAULT_BACKGROUND;
  const isUnchanged = draftColor.toLowerCase() === savedColor.toLowerCase();
  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(draftColor);
  const previewForeground = getForegroundColor(draftColor);

  const handleSave = async () => {
    if (isSaving || isUnchanged || !isValidHex) return;

    setIsSaving(true);
    try {
      await updateAppearance(user.id, draftColor);
      updateUserSettings({ backgroundColor: draftColor });
      trackEvent("settings_theme_changed", { backgroundColor: draftColor });

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
        {t("appearanceSettingsTitle")}
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        {t("appearanceSettingsDescription")}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-0.5">
          <label htmlFor="orbit-bg-color-picker" className={labelClass}>
            {t("backgroundColorLabel")}
          </label>
          <input
            id="orbit-bg-color-picker"
            type="color"
            value={isValidHex ? draftColor : DEFAULT_BACKGROUND}
            onChange={(e) => setDraftColor(e.target.value)}
            aria-label={t("backgroundColorLabel")}
            className="h-[42px] w-[64px] cursor-pointer rounded-[10px] border border-slate-200 bg-transparent p-1"
          />
        </div>

        <div className="flex flex-1 flex-col gap-0.5">
          <label htmlFor="orbit-bg-color-hex" className={labelClass}>
            {t("backgroundColorHexLabel")}
          </label>
          <input
            id="orbit-bg-color-hex"
            type="text"
            value={draftColor}
            onChange={(e) => setDraftColor(e.target.value)}
            placeholder={DEFAULT_BACKGROUND}
            aria-invalid={!isValidHex}
            className="h-[42px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
          />
          {!isValidHex && (
            <p className="mt-0.5 text-xs text-red-600">
              {t("backgroundColorInvalid")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-0.5">
        <span className={labelClass}>{t("previewLabel")}</span>
        <div
          className="flex h-20 w-full items-center justify-center rounded-[10px] border border-slate-200 text-sm font-medium"
          style={{
            backgroundColor: isValidHex ? draftColor : DEFAULT_BACKGROUND,
            color: previewForeground,
          }}
        >
          {t("previewSampleText")}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isUnchanged || !isValidHex}
          className="rounded-lg bg-[#605BFF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
        >
          {isSaving ? t("saving") : t("saveAppearance")}
        </button>
      </div>
    </div>
  );
}