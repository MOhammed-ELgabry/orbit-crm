import { useTranslation } from "react-i18next";
import { LuLanguages } from "react-icons/lu";

import Hint from "../../Components/ui/Hint";
import {
  setAuthLanguage,
  useAuthLanguage,
  type AuthLanguage,
} from "../../lib/authLocale";

const OPTIONS: { value: AuthLanguage; label: string; lang: string }[] = [
  { value: "ar", label: "العربية", lang: "ar" },
  { value: "en", label: "English", lang: "en" },
];

/**
 * Temporary language switch for the signed-out screens. Applies instantly
 * (no reload) and only to these screens: see lib/authLocale.ts for why it
 * cannot reach the user's saved language. Both options are always visible,
 * so nobody needs to know which language they are currently in to find it.
 */
export default function AuthLanguageSwitcher() {
  const { t } = useTranslation();
  const current = useAuthLanguage();

  return (
    <Hint id="authLanguage" placement="bottom">
      <div
        role="group"
        aria-label={t("helper_authLanguage_title")}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-card"
      >
        <LuLanguages
          size={16}
          className="mx-1.5 text-slate-400"
          aria-hidden="true"
        />

        {OPTIONS.map((option) => {
          const active = option.value === current;

          return (
            <button
              key={option.value}
              type="button"
              lang={option.lang}
              aria-pressed={active}
              onClick={() => setAuthLanguage(option.value)}
              className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors duration-200 focus-visible:outline-brand-500 ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Hint>
  );
}
