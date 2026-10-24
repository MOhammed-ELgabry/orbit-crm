import api from "./api";
import type { ApiEnvelope, PaginatedEnvelope } from "../types/api";
import type {
  AuditActor,
  AuditLogDetail,
  AuditLogListItem,
  AuditLogListResult,
  AuditLogQuery,
} from "../types/audit";

/**
 * Read-only audit-log endpoints (Owner only, enforced by the backend on every
 * request). Every call is a GET: api.ts attaches no CSRF header and nothing
 * here can create, change or delete an audit entry. The tenant is never sent.
 */

/** Drops empty filters so they are not sent as empty query strings. */
const cleanParams = (query: AuditLogQuery) =>
  Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );

export const listAuditLogs = async (
  query: AuditLogQuery,
  signal?: AbortSignal,
): Promise<AuditLogListResult> => {
  const response = await api.get<PaginatedEnvelope<AuditLogListItem>>(
    "/audit-logs",
    { params: cleanParams(query), signal },
  );

  return { items: response.data.data, meta: response.data.meta };
};

export const listAuditActors = async (
  signal?: AbortSignal,
): Promise<AuditActor[]> => {
  const response = await api.get<ApiEnvelope<AuditActor[]>>(
    "/audit-logs/actors",
    { signal },
  );

  return response.data.data;
};

export const getAuditLog = async (
  id: string,
  signal?: AbortSignal,
): Promise<AuditLogDetail> => {
  const response = await api.get<ApiEnvelope<AuditLogDetail>>(
    `/audit-logs/${encodeURIComponent(id)}`,
    { signal },
  );

  return response.data.data;
};
