import { Injectable } from '@nestjs/common';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CALENDAR_LIST_MAX_RESULTS } from '../constants/calendar.constants';
import { CalendarEventEntity } from '../entities/calendar-event.entity';

import {
  CalendarEventListFilters,
  CalendarEventListResult,
  CreateCalendarEventInput,
  ICalendarEventRepository,
  UpdateCalendarEventInput,
} from './calendar-event.repository.interface';

@Injectable()
export class CalendarEventRepository implements ICalendarEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEventEntity> {
    try {
      const event = await this.prisma.calendarEvent.create({
        data: {
          companyId,
          createdById: input.createdById,

          title: input.title,
          description: input.description,
          location: input.location,

          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,

          contactId: input.contactId,
          leadId: input.leadId,
          dealId: input.dealId,
          assignedToId: input.assignedToId,
        },
      });

      return new CalendarEventEntity(event);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  /**
   * `startAt` between queryLowerBound (from minus the max event
   * duration, computed by CalendarService) and `to` is what lets
   * Postgres answer this from the (companyId, startAt) index as a
   * single bounded range scan. `endAt > from` is the second half of
   * the real "does this event overlap [from, to)" test and is applied
   * as a plain filter on the rows the index scan already narrowed
   * down to — it is not itself indexed, and does not need to be: an
   * event's duration is capped at CALENDAR_MAX_EVENT_DURATION_DAYS, so
   * queryLowerBound already guarantees nothing outside the visible
   * window's start can possibly match, and there are at most a few
   * weeks of events per company in that narrowed range for this
   * second filter to run against, not the company's whole history.
   */
  async findAll(
    companyId: string,
    from: Date,
    to: Date,
    queryLowerBound: Date,
    filters: CalendarEventListFilters,
  ): Promise<CalendarEventListResult> {
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        companyId,
        deletedAt: null,

        startAt: {
          gte: queryLowerBound,
          lt: to,
        },
        endAt: {
          gt: from,
        },

        ...(filters.status !== undefined && { status: filters.status }),
        ...(filters.assignedToId !== undefined && {
          assignedToId: filters.assignedToId,
        }),
        ...(filters.contactId !== undefined && {
          contactId: filters.contactId,
        }),
        ...(filters.leadId !== undefined && { leadId: filters.leadId }),
        ...(filters.dealId !== undefined && { dealId: filters.dealId }),
      },

      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],

      // One extra row so hasMore can be answered without a second
      // (and, on a large range, potentially expensive) count query.
      take: CALENDAR_LIST_MAX_RESULTS + 1,
    });

    const hasMore = rows.length > CALENDAR_LIST_MAX_RESULTS;
    const data = (hasMore ? rows.slice(0, CALENDAR_LIST_MAX_RESULTS) : rows).map(
      (row) => new CalendarEventEntity(row),
    );

    return { data, hasMore };
  }

  async findById(
    companyId: string,
    id: string,
  ): Promise<CalendarEventEntity | null> {
    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
      },
    });

    if (!event) {
      return null;
    }

    return new CalendarEventEntity(event);
  }

  /**
   * No pre-check before this update, unlike TaskRepository's — every
   * caller here (CalendarService) has already done its own findById
   * immediately before, to fetch the existing startAt/endAt/allDay it
   * needs for merged-date validation, so a second existence check
   * would just be a redundant query. The narrow TOCTOU gap between
   * that fetch and this write (the row is deleted by another request
   * in between) still fails safely: `id` + `companyId` +
   * `deletedAt: null` in the where clause together with `id` makes
   * Prisma treat a non-matching row as not found, which throws P2025 —
   * PrismaExceptionMapper turns that into the same NotFoundException
   * the service would have thrown anyway.
   */
  async update(
    companyId: string,
    id: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventEntity> {
    try {
      const event = await this.prisma.calendarEvent.update({
        where: {
          id,
          companyId,
          deletedAt: null,
        },

        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.location !== undefined && { location: input.location }),

          ...(input.startAt !== undefined && { startAt: input.startAt }),
          ...(input.endAt !== undefined && { endAt: input.endAt }),
          ...(input.allDay !== undefined && { allDay: input.allDay }),
          ...(input.status !== undefined && { status: input.status }),

          ...(input.contactId !== undefined && {
            contactId: input.contactId,
          }),
          ...(input.leadId !== undefined && { leadId: input.leadId }),
          ...(input.dealId !== undefined && { dealId: input.dealId }),
          ...(input.assignedToId !== undefined && {
            assignedToId: input.assignedToId,
          }),
        },
      });

      return new CalendarEventEntity(event);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(companyId: string, id: string): Promise<boolean> {
    try {
      const result = await this.prisma.calendarEvent.updateMany({
        where: {
          id,
          companyId,
          deletedAt: null,
        },

        data: {
          deletedAt: new Date(),
        },
      });

      return result.count > 0;
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}