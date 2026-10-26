import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

/**
 * Guards routes that require an authenticated session (currently just
 * /dashboard). Session state lives in an HttpOnly cookie this code can't
 * read directly, so AuthContext resolves it once on load via GET
 * /auth/me — isLoading distinguishes "still checking" from "checked, and
 * there's no session" so we don't redirect a genuinely logged-in user
 * away during that first check.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600"
          aria-label="Loading"
          role="status"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
