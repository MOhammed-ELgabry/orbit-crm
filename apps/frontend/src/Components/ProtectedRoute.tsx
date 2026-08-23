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
 *
 * Deliberately NOT used for /industry-selection: that step runs before
 * the required explicit Login step even exists, so a normal-flow user
 * has no session to check at that point by design. That page guards
 * itself instead, by checking for the onboarding token it was navigated
 * in with.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8]">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-[#EEEEF5] border-t-[#605BFF]"
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