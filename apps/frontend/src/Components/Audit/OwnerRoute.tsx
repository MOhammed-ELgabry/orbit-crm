import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

/**
 * UX-ONLY gate: sends a signed-in non-Owner back to the dashboard instead of
 * showing them a page whose requests would all be refused.
 *
 * This is NOT the protection. `user.isOwner` here comes from the client's own
 * state and can be changed in the browser. The backend re-verifies the Owner
 * and the company against the database on every /audit-logs request
 * (OwnerGuard + AuditOwnerGuard) and answers 401/403 regardless of what this
 * component rendered.
 *
 * Mounted inside ProtectedRoute, so authentication/loading is already handled.
 */
export default function OwnerRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user?.isOwner) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
