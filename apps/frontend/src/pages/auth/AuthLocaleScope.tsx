import { useLayoutEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { Outlet } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import {
  appLanguage,
  authI18n,
  directionOf,
  forgetAuthLanguageChoice,
  syncAuthLanguageWithApp,
  useAuthLanguage,
} from "../../lib/authLocale";

/**
 * Provides the isolated sign-in i18n instance to everything below it and
 * keeps <html dir/lang> in step with it, so popups (SweetAlert2 renders
 * into <body>) read in the language of the screen that opened them.
 * On unmount the document goes back to the app's language.
 */
function AuthLocaleProvider({ children }: { children: ReactNode }) {
  // Lazy initialiser: runs once, before the first child render, so the
  // first paint is already in the right language.
  useState(() => {
    syncAuthLanguageWithApp();

    return null;
  });

  const language = useAuthLanguage();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const dir = directionOf(language);

    const apply = () => {
      if (root.dir !== dir) root.dir = dir;
      if (root.lang !== language) root.lang = language;
    };

    apply();

    // On sign-in, AuthContext applies the saved language to <html> while the
    // success popup is still open on this screen (LoginForm awaits it before
    // navigating). The screen and popup are still in the temporary language,
    // so re-assert ours until the screen unmounts; the cleanup below then
    // hands <html> to the app's (saved) language in the same commit as the
    // navigation, so no frame mixes one language with the other's direction.
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["dir", "lang"],
    });

    return () => {
      observer.disconnect();

      // The welcome popup is still fading out when the app takes over. Its
      // text is in this screen's language, so keep its own direction until
      // SweetAlert removes it (the attributes go away with the element).
      document
        .querySelectorAll<HTMLElement>(".swal2-container")
        .forEach((el) => {
          el.dir = dir;
          el.lang = language;
        });

      root.dir = directionOf(appLanguage());
      root.lang = appLanguage();
    };
  }, [language]);

  return <I18nextProvider i18n={authI18n}>{children}</I18nextProvider>;
}

/** Route layout wrapping every sign-in screen (login, register, ...). */
export function AuthLocaleLayout() {
  const { isAuthenticated } = useAuth();

  // Once signed in, the temporary choice no longer applies to anything.
  useLayoutEffect(() => {
    if (isAuthenticated) {
      forgetAuthLanguageChoice();
    }
  }, [isAuthenticated]);

  return (
    <AuthLocaleProvider>
      <Outlet />
    </AuthLocaleProvider>
  );
}

/**
 * The public /terms and /privacy pages: signed-out visitors see them in
 * the language they picked on the sign-in screens; signed-in users keep
 * the app's own language (their saved setting), unchanged.
 */
export function LegalLocaleScope({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return <AuthLocaleProvider>{children}</AuthLocaleProvider>;
}
