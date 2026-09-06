import api from "./api";
import type { ApiEnvelope, PaginatedEnvelope, PaginationMeta } from "../types/api";
import type {
  Activity,
  ActivityQuery,
  CreateActivityInput,
  UpdateActivityInput,
} from "../types/activity";

export interface ActivityListResult {
  activities: Activity[];
  meta: PaginationMeta;
}

export const listActivities = async (
  query: ActivityQuery = {},
): Promise<ActivityListResult> => {
  const response = await api.get<PaginatedEnvelope<Activity>>("/activities", {
    params: query,
  });

  return { activities: response.data.data, meta: response.data.meta };
};

export const getActivity = async (id: string): Promise<Activity> => {
  const response = await api.get<ApiEnvelope<Activity>>(`/activities/${id}`);

  return response.data.data;
};

export const createActivity = async (
  input: CreateActivityInput,
): Promise<Activity> => {
  const response = await api.post<ApiEnvelope<Activity>>(
    "/activities",
    input,
  );

  return response.data.data;
};

export const updateActivity = async (
  id: string,
  input: UpdateActivityInput,
): Promise<Activity> => {
  const response = await api.patch<ApiEnvelope<Activity>>(
    `/activities/${id}`,
    input,
  );

  return response.data.data;
};

export const deleteActivity = async (id: string): Promise<void> => {
  await api.delete(`/activities/${id}`);
};

/** A contact's timeline is just activities filtered by contactId — no separate endpoint. */
export const listContactTimeline = async (
  contactId: string,
  query: Omit<ActivityQuery, "contactId"> = {},
): Promise<ActivityListResult> =>
  listActivities({ ...query, contactId, sortBy: "occurredAt", sortOrder: "desc" });
