import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { tokenStorage, type StoredUser } from "../services/tokenStorage";

interface AuthContextValue {
  user: StoredUser | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, user: StoredUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(() =>
    tokenStorage.getUser(),
  );

  const login = useCallback(
    (accessToken: string, refreshToken: string, nextUser: StoredUser) => {
      tokenStorage.setTokens(accessToken, refreshToken);
      tokenStorage.setUser(nextUser);
      setUser(nextUser);
    },
    [],
  );

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      login,
      logout,
    }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}