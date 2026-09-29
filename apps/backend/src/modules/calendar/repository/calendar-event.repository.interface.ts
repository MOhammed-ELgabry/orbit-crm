import { CalendarEventEntity } from '../entities/calendar-event.entity';

/**
 * companyId is always supplied separately from the DTO by the caller
 * (CalendarService), never read from it — the same shape every other
 * repository in this codebase uses, so a companyId can never arrive
 * via a request body.
 */
export interface CreateCalendarEventInput {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  contactId: string | null;
  leadId: string | null;
  dealId: string | null;
  assignedToId: string | null;
  createdById: string;
}

/**
 * A field set to `undefined` is left unchanged; a field explicitly
 * `null` clears that column. This mirrors exactly how TaskRepository/
 * DealRepository already interpret their own update inputs, and is
 * why CalendarService builds this object with conditional spreads
 * rather than passing the raw UpdateCalendarEventDto straight through.
 */
export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  status?: string;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  assignedToId?: string | null;
}

export interface CalendarEventListFilters {
  status?: string;
  assignedToId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
}

export interface CalendarEventListResult {
  data: CalendarEventEntity[];
  hasMore: boolean;
}

export interface ICalendarEventRepository {
  create(
    companyId: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEventEntity>;

  /**
   * from/to bound the visible window; queryLowerBound is
   * from minus CALENDAR_MAX_EVENT_DURATION_DAYS, precomputed by the
   * caller (CalendarService) rather than by the repository, so the
   * 31-day event-duration invariant that makes this bound valid stays
   * documented in exactly one place — see CalendarService.findAll.
   */
  findAll(
    companyId: string,
    from: Date,
    to: Date,
    queryLowerBound: Date,
    filters: CalendarEventListFilters,
  ): Promise<CalendarEventListResult>;

  findById(
    companyId: string,
    id: string,
  ): Promise<CalendarEventEntity | null>;

  update(
    companyId: string,
    id: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventEntity>;

  softDelete(companyId: string, id: string): Promise<boolean>;
}