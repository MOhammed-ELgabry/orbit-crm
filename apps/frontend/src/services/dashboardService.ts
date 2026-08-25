import api from "./api";

export interface DashboardStats {
  contactsCount: number;
  teamMembersCount: number;
}

/**
 * Both endpoints already exist and are tenant-scoped (JwtAuthGuard reads
 * req.user.companyId server-side) — this asks for 1 record per call
 * purely to read `meta.total` cheaply, not to actually list anything.
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const [contactsResponse, usersResponse] = await Promise.all([
    api.get("/api/contacts", { params: { page: 1, limit: 1 } }),
    api.get("/api/users", { params: { page: 1, limit: 1 } }),
  ]);

  return {
    contactsCount: contactsResponse.data?.meta?.total ?? 0,
    teamMembersCount: usersResponse.data?.meta?.total ?? 0,
  };
};