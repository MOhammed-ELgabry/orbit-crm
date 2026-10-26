import { useSyncExternalStore } from "react";
import i18n from "i18next";

import { resources } from "../locales/resources";

/**
 * Temporary language for the signed-out screens.
 *
 * Isolation by construction: this is a SEPARATE i18next instance with the
 * same resources as the app's. Choosing a language here
 *   - never touches the global i18n instance (which AuthContext drives from
 *     the signed-in user's saved language),
 *   - never calls the API or writes to the database,
 *   - never writes to localStorage / sessionStorage / cookies; it lives in
 *     memory, so it survives navigation between sign-in pages (SPA routing)
 *     and is simply gone on a full reload or in another tab.
 * After sign-in the app keeps using the global instance exactly as before,
 * so the temporary choice cannot be imposed on a user's account.
 */
export type AuthLanguage = "en" | "ar";

export const authI18n = i18n.createInstance();

void authI18n.init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Has the visitor picked a language on a signed-out screen during this
// page load? If not, the screens follow the app's language (e.g. the one
// of the user who just logged out) instead of a stale default.
let chosenByVisitor = false;

const toAuthLanguage = (language: string | undefined): AuthLanguage =>
  language === "ar" ? "ar" : "en";

export const directionOf = (language: AuthLanguage) =>
  language === "ar" ? "rtl" : "ltr";

/** The app-wide (global) language, read-only from here. */
export function appLanguage(): AuthLanguage {
  return toAuthLanguage(i18n.language);
}

export function setAuthLanguage(language: AuthLanguage) {
  chosenByVisitor = true;
  void authI18n.changeLanguage(language);
}

/** Follow the app language unless the visitor already chose one. */
export function syncAuthLanguageWithApp() {
  if (!chosenByVisitor && toAuthLanguage(authI18n.language) !== appLanguage()) {
    void authI18n.changeLanguage(appLanguage());
  }
}

/** Called once someone signs in: the temporary choice stops applying. */
export function forgetAuthLanguageChoice() {
  chosenByVisitor = false;
}

function subscribe(onChange: () => void) {
  authI18n.on("languageChanged", onChange);

  return () => authI18n.off("languageChanged", onChange);
}

export function useAuthLanguage(): AuthLanguage {
  return useSyncExternalStore(subscribe, () =>
    toAuthLanguage(authI18n.language),
  );
}
