import api from "./api";

export interface DashboardStats {
  contactsCount: number;
  teamMembersCount: number;
  activitiesCount: number;
  upcomingActivitiesCount: number;
}

/**
 * All four endpoints already exist and are tenant-scoped (JwtAuthGuard
 * reads req.user.companyId server-side).
 *
 * NOTE: this previously called "/api/contacts" and "/api/users" — this
 * app has no global "/api" prefix (see backend/src/main.ts — no
 * app.setGlobalPrefix() call), so those 404'd against the real
 * backend. Routes are "/contacts", "/users", "/activities" directly.
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const nowIso = new Date().toISOString();

  const [contactsResponse, usersResponse, activitiesResponse, upcomingResponse] =
    await Promise.all([
      // Read-only counts (1 record per call, purely to read meta.total
      // cheaply) — never mutating, so these don't need the CSRF header
      // api.ts already attaches for state-changing requests.
      api.get("/contacts", { params: { page: 1, limit: 1 } }),
      api.get("/users", { params: { page: 1, limit: 1 } }),
      api.get("/activities", { params: { page: 1, limit: 1 } }),
      // "Upcoming" = occurredAt in the future. ActivityQueryDto's
      // dateFrom filter is an inclusive lower bound the backend
      // already supports (see ActivityQueryDto) — no new backend work
      // needed for this.
      api.get("/activities", {
        params: { page: 1, limit: 1, dateFrom: nowIso },
      }),
    ]);

  return {
    contactsCount: contactsResponse.data?.meta?.total ?? 0,
    teamMembersCount: usersResponse.data?.meta?.total ?? 0,
    activitiesCount: activitiesResponse.data?.meta?.total ?? 0,
    upcomingActivitiesCount: upcomingResponse.data?.meta?.total ?? 0,
  };
};