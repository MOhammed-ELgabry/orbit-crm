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
  // Re-fetches /companies/me — called after an action that changes
  // company data the rest of the app has already cached here (e.g. a
  // Settings page edit), so every consumer sees the update without a
  // full page reload.
  refetchCompany: () => Promise<void>;
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
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      company,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      refetchCompany,
    }),
    [user, company, isLoading, login, logout, refetchCompany],
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