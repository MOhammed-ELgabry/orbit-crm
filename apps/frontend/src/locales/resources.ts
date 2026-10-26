import en from "./en/translation";
import ar from "./ar/translation";
import enHelpers from "./en/helpers";
import arHelpers from "./ar/helpers";

/**
 * The single translation bundle, shared by the app's global i18n instance
 * (i18n.ts) and the isolated sign-in instance (lib/authLocale.tsx), so the
 * two can never drift apart.
 */
export const resources = {
  en: { translation: { ...en, ...enHelpers } },
  ar: { translation: { ...ar, ...arHelpers } },
};
