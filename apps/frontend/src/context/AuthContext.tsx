import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getCurrentUser,
  logoutUser,
  type AuthUser,
} from "../services/authService";
import { getMyCompany, type Company } from "../services/companyService";
import { identifyAnalyticsUser, resetAnalyticsIdentity } from "../lib/posthog";
import i18n from "i18next";
import { getForegroundColor } from "../lib/contrast";

/**
 * Applies a user's saved language and appearance to the document —
 * shared by both the session-restore effect below and every Settings
 * save handler, so "switch language/appearance right now" and "restore
 * it on next load" can never drift apart into two different code paths.
 *
 * Sets `dir` on <html> here (not just per-page, as the old floating
 * LanguageSwitcher used to) so it's correct for every route, including
 * on a hard refresh, before any component has rendered.
 */
function applyUserPreferences(preferences: {
  language: AuthUser["language"];
  backgroundColor: AuthUser["backgroundColor"];
}) {
  i18n.changeLanguage(preferences.language);
  document.documentElement.dir = preferences.language === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = preferences.language;

  const root = document.documentElement;

  if (preferences.backgroundColor) {
    root.style.setProperty("--orbit-content-bg", preferences.backgroundColor);
    root.style.setProperty(
      "--orbit-content-fg",
      getForegroundColor(preferences.backgroundColor),
    );
  } else {
    // No custom preference — fall back to the application's built-in
    // default by removing the override rather than hardcoding it here,
    // so that default can keep evolving in index.css independently.
    root.style.removeProperty("--orbit-content-bg");
    root.style.removeProperty("--orbit-content-fg");
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  // The authenticated user's own company — null until loaded, and
  // also null if it fails to load (session cookies are the source of
  // truth for auth; a company fetch failing shouldn't force a logout).
  // businessType lives on this, since dashboard routing (see
  // DashboardPage) needs it and the backend is the only authority for
  // it — never trust a client-side guess or cached value across a
  // company switching business type.
  company: Company | null;
  isAuthenticated: boolean;
  // True while the initial session check (GET /auth/me) is in flight, so
  // consumers can tell "not logged in" apart from "don't know yet" and
  // avoid a flash of logged-out UI on load.
  isLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  // UX-only convenience over user.permissions — mirrors the backend's own
  // isOwner-bypass-first check (see AuthService.resolveUserPermissions),
  // so a "resource:action" string like "lead:create" reads the same way
  // here as it does server-side. The backend remains the sole authority;
  // this only decides what the UI shows/hides.
  hasPermission: (permission: string) => boolean;
  // Re-fetches /companies/me — called after an action that changes
  // company data the rest of the app has already cached here (e.g. a
  // Settings page edit), so every consumer sees the update without a
  // full page reload.
  refetchCompany: () => Promise<void>;
  // Merges a successful Settings → Language/Appearance save into the
  // already-loaded user, without refetching /auth/me. Deliberately a
  // partial merge (not setUser(fullResponse)) — the language/appearance
  // endpoints return the same user record PATCH /users/:id does, which
  // has no `permissions` field, unlike this context's AuthUser; merging
  // only the field that changed can never drop it.
  updateUserSettings: (
    settings: Partial<Pick<AuthUser, "language" | "backgroundColor">>,
  ) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetchCompany = useCallback(async () => {
    try {
      const nextCompany = await getMyCompany();
      setCompany(nextCompany);
    } catch {
      // Leave the previous value in place rather than clearing it — a
      // transient network error here shouldn't make an already-loaded
      // dashboard suddenly render as if businessType were unknown.
    }
  }, []);

  // Session state now lives entirely in HttpOnly cookies this code can't
  // read, so on load we ask the backend who (if anyone) the cookies
  // belong to, rather than reading a locally cached user. The company
  // fetch runs only after we know there is a session — GET /companies/me
  // requires auth, so firing it unconditionally would just 401 on every
  // logged-out page load.
  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        setUser(response.user);

        try {
          const myCompany = await getMyCompany();
          if (!cancelled) {
            setCompany(myCompany);
          }
        } catch {
          // Session is still valid even if this particular call fails
          // (e.g. a transient network blip) — businessType-dependent UI
          // falls back to a generic view rather than the whole app
          // treating this as logged-out.
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setCompany(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Covers both ways `user` can become non-null — a fresh login/social
  // auth (via the `login` callback below) and an existing session
  // restored on page load (the effect above, which sets it directly) —
  // so every authenticated page load links events to the right person,
  // not just ones that started at the login form. Intentionally does
  // NOT reset() when `user` goes back to null, since that also happens
  // transiently on initial mount before the session check resolves;
  // an explicit logout (below) is the only thing that should start a
  // fresh anonymous identity.
  useEffect(() => {
    if (user) {
      identifyAnalyticsUser(user);
    }
  }, [user]);

  // Runs whenever `user` becomes available or its language/appearance
  // changes — covers session restore on load, a fresh login, and a
  // Settings save, all through the same applyUserPreferences() path.
  // ProtectedRoute already withholds the authenticated app behind
  // isLoading until the session-restore effect above resolves, so by
  // the time a protected page actually renders, this has already run —
  // no separate loading gate is needed here for a flash-free apply.
  useEffect(() => {
    if (user) {
      applyUserPreferences({
        language: user.language,
        backgroundColor: user.backgroundColor,
      });
    }
  }, [user]);

  const login = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Cookies may already be gone (e.g. the session had expired) — the
      // user's intent is satisfied either way, so this isn't surfaced as
      // an error to the caller.
    } finally {
      setUser(null);
      setCompany(null);
      resetAnalyticsIdentity();
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string) =>
      user !== null && (user.isOwner || user.permissions.includes(permission)),
    [user],
  );

  const updateUserSettings = useCallback(
    (settings: Partial<Pick<AuthUser, "language" | "backgroundColor">>) => {
      setUser((prev) => (prev ? { ...prev, ...settings } : prev));
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      company,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      hasPermission,
      refetchCompany,
      updateUserSettings,
    }),
    [
      user,
      company,
      isLoading,
      login,
      logout,
      hasPermission,
      refetchCompany,
      updateUserSettings,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// This file predates this change and already exported both the
// AuthProvider component and this hook together — not something
// introduced here. Splitting useAuth into its own file to satisfy
// react-refresh/only-export-components would touch every file that
// imports it (Sidebar, ContactsPage, ContactDetailPage, UsersPage,
// SettingsPage, BusinessDashboard, DashboardHeader, ...) for a
// dev-only Fast Refresh nicety, not a functional bug.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}