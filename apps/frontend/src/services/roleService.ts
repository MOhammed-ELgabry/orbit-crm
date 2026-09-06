import api from "./api";
import type { PaginatedEnvelope } from "../types/api";

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Only what the Team page's role-assignment dropdown needs. Creating
 * and editing roles/permissions has no dedicated UI yet — use the API
 * directly (RoleController / PermissionController) for that; this file
 * intentionally does not grow into a full role-management client.
 */
export const listAssignableRoles = async (): Promise<RoleSummary[]> => {
  const response = await api.get<PaginatedEnvelope<RoleSummary>>("/roles", {
    params: { page: 1, limit: 100, sortBy: "name", sortOrder: "asc" },
  });

  return response.data.data;
};