import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type {
  LeadsOverviewReport,
  PipelineSnapshotReport,
  ReportPeriod,
  TasksOverviewReport,
} from "../types/report";

/**
 * Read-only report endpoints. The tenant is never sent: the backend takes
 * it from the session cookie, and rejects any extra query key. Each call is
 * a GET, so api.ts attaches no CSRF header.
 */
const fetchReport = async <T>(
  path: string,
  period: ReportPeriod,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await api.get<ApiEnvelope<T>>(path, {
    params: { from: period.from, to: period.to, timezone: period.timezone },
    signal,
  });

  return response.data.data;
};

export const getPipelineSnapshot = (
  period: ReportPeriod,
  signal?: AbortSignal,
) =>
  fetchReport<PipelineSnapshotReport>(
    "/reports/pipeline-snapshot",
    period,
    signal,
  );

export const getLeadsOverview = (period: ReportPeriod, signal?: AbortSignal) =>
  fetchReport<LeadsOverviewReport>("/reports/leads-overview", period, signal);

export const getTasksOverview = (period: ReportPeriod, signal?: AbortSignal) =>
  fetchReport<TasksOverviewReport>("/reports/tasks-overview", period, signal);
