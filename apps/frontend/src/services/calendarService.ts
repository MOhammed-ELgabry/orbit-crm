import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type {
  CalendarEvent,
  CalendarEventListMeta,
  CalendarEventQuery,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "../types/calendar";

export interface CalendarEventListResult {
  events: CalendarEvent[];
  meta: CalendarEventListMeta;
}

/**
 * ResponseInterceptor (backend) detects any handler return value
 * shaped like { data, meta } and flattens it to top-level `data`/`meta`
 * siblings on the envelope, exactly like every other paginated list in
 * this app — CalendarService.findAll's return value takes advantage of
 * that existing behavior rather than needing anything Calendar-
 * specific on the backend. Only the meta shape differs from the usual
 * page-based PaginationMeta (types/api.ts), hence this file's own
 * envelope type instead of reusing PaginatedEnvelope<T>.
 */
interface CalendarListEnvelope {
  success: boolean;
  statusCode: number;
  message: string;
  data: CalendarEvent[];
  meta: CalendarEventListMeta;
  timestamp: string;
}

export const listCalendarEvents = async (
  query: CalendarEventQuery,
): Promise<CalendarEventListResult> => {
  const response = await api.get<CalendarListEnvelope>("/calendar", {
    params: query,
  });

  return { events: response.data.data, meta: response.data.meta };
};

export const getCalendarEvent = async (id: string): Promise<CalendarEvent> => {
  const response = await api.get<ApiEnvelope<CalendarEvent>>(`/calendar/${id}`);
  return response.data.data;
};

export const createCalendarEvent = async (
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> => {
  const response = await api.post<ApiEnvelope<CalendarEvent>>("/calendar", input);
  return response.data.data;
};

export const updateCalendarEvent = async (
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent> => {
  const response = await api.patch<ApiEnvelope<CalendarEvent>>(
    `/calendar/${id}`,
    input,
  );
  return response.data.data;
};

export const deleteCalendarEvent = async (id: string): Promise<void> => {
  await api.delete(`/calendar/${id}`);
};