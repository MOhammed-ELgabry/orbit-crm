import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CALENDAR_MAX_EVENT_DURATION_DAYS,
  CALENDAR_MAX_QUERY_RANGE_DAYS,
  CALENDAR_LIST_MAX_RESULTS,
  CALENDAR_REPOSITORY,
} from './constants/calendar.constants';

import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CalendarEventEntity } from './entities/calendar-event.entity';

import type { ICalendarEventRepository } from './repository/calendar-event.repository.interface';

import { ActivityService } from '../activity/activity.service';
import { ContactService } from '../contact/contact.service';
import { LeadService } from '../lead/lead.service';
import { DealService } from '../deal/deal.service';
import { UserService } from '../user/user.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CalendarEventListMeta {
  from: string;
  to: string;
  limit: number;
  hasMore: boolean;
}

export interface CalendarEventListResponse {
  data: CalendarEventEntity[];
  meta: CalendarEventListMeta;
}

@Injectable()
export class CalendarService {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendarEventRepository: ICalendarEventRepository,

    private readonly contactService: ContactService,
    private readonly leadService: LeadService,
    private readonly dealService: DealService,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
  ) {}

  async create(
    companyId: string,
    createdById: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventEntity> {
    await this.assertRelations(companyId, dto);

    const startAt = this.parseDate(dto.startAt, 'startAt');
    const endAt = this.parseDate(dto.endAt, 'endAt');
    const allDay = dto.allDay ?? false;

    this.validateTiming(startAt, endAt, allDay);

    const event = await this.calendarEventRepository.create(companyId, {
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location ?? null,

      startAt,
      endAt,
      allDay,

      contactId: dto.contactId ?? null,
      leadId: dto.leadId ?? null,
      dealId: dto.dealId ?? null,
      assignedToId: dto.assignedToId ?? null,

      createdById,
    });

    await this.activityService.logCalendarEvent(companyId, createdById, {
      type: 'SYSTEM',
      title: `Calendar event created: ${event.title}`,
      calendarEventId: event.id,
    });

    return event;
  }

  /**
   * from/to bound the visible window the caller is rendering (a month,
   * an agenda page); queryLowerBound extends that window backward by
   * CALENDAR_MAX_EVENT_DURATION_DAYS so the repository's index range
   * scan can never miss a long event that started before `from` but
   * still overlaps it — see CalendarEventRepository.findAll for the
   * other half of that reasoning.
   */
  async findAll(
    companyId: string,
    query: CalendarEventQueryDto,
  ): Promise<CalendarEventListResponse> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');

    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('to must be after from.');
    }

    const rangeDays = (to.getTime() - from.getTime()) / MS_PER_DAY;
    if (rangeDays > CALENDAR_MAX_QUERY_RANGE_DAYS) {
      throw new BadRequestException(
        `The date range cannot exceed ${CALENDAR_MAX_QUERY_RANGE_DAYS} days.`,
      );
    }

    const queryLowerBound = new Date(
      from.getTime() - CALENDAR_MAX_EVENT_DURATION_DAYS * MS_PER_DAY,
    );

    const result = await this.calendarEventRepository.findAll(
      companyId,
      from,
      to,
      queryLowerBound,
      {
        status: query.status,
        assignedToId: query.assignedToId,
        contactId: query.contactId,
        leadId: query.leadId,
        dealId: query.dealId,
      },
    );

    return {
      data: result.data,
      meta: {
        from: query.from,
        to: query.to,
        limit: CALENDAR_LIST_MAX_RESULTS,
        hasMore: result.hasMore,
      },
    };
  }

  async findById(companyId: string, id: string): Promise<CalendarEventEntity> {
    const event = await this.calendarEventRepository.findById(companyId, id);

    if (!event) {
      throw new NotFoundException(`Calendar event with ID "${id}" not found.`);
    }

    return event;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateCalendarEventDto,
    actorId: string,
  ): Promise<CalendarEventEntity> {
    const before = await this.calendarEventRepository.findById(companyId, id);

    if (!before) {
      throw new NotFoundException(`Calendar event with ID "${id}" not found.`);
    }

    await this.assertRelations(companyId, dto);

    const timingTouched =
      dto.startAt !== undefined ||
      dto.endAt !== undefined ||
      dto.allDay !== undefined;

    const mergedStartAt =
      dto.startAt !== undefined ? this.parseDate(dto.startAt, 'startAt') : before.startAt;
    const mergedEndAt =
      dto.endAt !== undefined ? this.parseDate(dto.endAt, 'endAt') : before.endAt;
    const mergedAllDay = dto.allDay !== undefined ? dto.allDay : before.allDay;

    if (timingTouched) {
      this.validateTiming(mergedStartAt, mergedEndAt, mergedAllDay);
    }

    const after = await this.calendarEventRepository.update(companyId, id, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.location !== undefined && { location: dto.location }),

      ...(dto.startAt !== undefined && { startAt: mergedStartAt }),
      ...(dto.endAt !== undefined && { endAt: mergedEndAt }),
      ...(dto.allDay !== undefined && { allDay: mergedAllDay }),
      ...(dto.status !== undefined && { status: dto.status }),

      ...(dto.contactId !== undefined && { contactId: dto.contactId }),
      ...(dto.leadId !== undefined && { leadId: dto.leadId }),
      ...(dto.dealId !== undefined && { dealId: dto.dealId }),
      ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
    });

    await this.logUpdateEvents(companyId, actorId, before, after);

    return after;
  }

  async remove(companyId: string, id: string, actorId: string): Promise<void> {
    const existing = await this.calendarEventRepository.findById(companyId, id);

    if (!existing) {
      throw new NotFoundException(`Calendar event with ID "${id}" not found.`);
    }

    const deleted = await this.calendarEventRepository.softDelete(companyId, id);

    if (!deleted) {
      throw new NotFoundException(`Calendar event with ID "${id}" not found.`);
    }

    await this.activityService.logCalendarEvent(companyId, actorId, {
      type: 'SYSTEM',
      title: `Calendar event deleted: ${existing.title}`,
      calendarEventId: id,
    });
  }

  /**
   * Ensures every client-supplied relation ID actually belongs to the
   * caller's own company before anything is written — same shape as
   * TaskService's own assertRelations/assertXInCompany helpers, with
   * one deliberate difference: those catch *any* error from the
   * underlying xService.findById call and report it as "not found",
   * including an error that has nothing to do with the ID being wrong
   * (a transient DB failure, a bug elsewhere). That would both mislead
   * the caller and — since an expected 4xx never reaches Sentry the
   * way an unhandled exception does — hide a genuine infrastructure
   * problem behind a misleading "bad ID" response. The helpers below
   * only convert a NotFoundException (the actual "wrong company or
   * doesn't exist" signal every xService.findById throws) into
   * Calendar's own not-found message; anything else propagates
   * unchanged, so it still becomes the same 500 it would have been
   * anywhere else in the codebase.
   */
  private async assertContactInCompany(
    contactId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.contactService.findById(companyId, contactId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(
          `contactId "${contactId}" does not reference a contact in this company.`,
        );
      }
      throw error;
    }
  }

  /** Same guarantee as assertContactInCompany, for leadId. */
  private async assertLeadInCompany(leadId: string, companyId: string): Promise<void> {
    try {
      await this.leadService.findById(companyId, leadId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(
          `leadId "${leadId}" does not reference a lead in this company.`,
        );
      }
      throw error;
    }
  }

  /** Same guarantee as assertContactInCompany, for dealId. */
  private async assertDealInCompany(dealId: string, companyId: string): Promise<void> {
    try {
      await this.dealService.findById(companyId, dealId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(
          `dealId "${dealId}" does not reference a deal in this company.`,
        );
      }
      throw error;
    }
  }

  /**
   * Same guarantee as assertContactInCompany, for assignedToId. Note
   * the argument order below: UserService.findById is (id, companyId)
   * — the reverse of ContactService/LeadService/DealService's own
   * (companyId, id) — so this passes assignedToId first deliberately,
   * not by mistake.
   */
  private async assertUserAssignableInCompany(
    assignedToId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.userService.findById(assignedToId, companyId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(
          `assignedToId "${assignedToId}" does not reference a user in this company.`,
        );
      }
      throw error;
    }
  }

  private async assertRelations(
    companyId: string,
    dto: CreateCalendarEventDto | UpdateCalendarEventDto,
  ): Promise<void> {
    if (dto.contactId) {
      await this.assertContactInCompany(dto.contactId, companyId);
    }
    if (dto.leadId) {
      await this.assertLeadInCompany(dto.leadId, companyId);
    }
    if (dto.dealId) {
      await this.assertDealInCompany(dto.dealId, companyId);
    }
    if (dto.assignedToId) {
      await this.assertUserAssignableInCompany(dto.assignedToId, companyId);
    }
  }

  /**
   * Rejects a string that doesn't parse to a real instant with 400
   * rather than letting `new Date('garbage')` — an Invalid Date, not a
   * thrown error — reach Prisma, which would surface as a confusing
   * 500. @IsDateString() on the DTO already rejects most malformed
   * input before this ever runs; this is the second, defense-in-depth
   * layer the date-handling requirements explicitly call for, not a
   * substitute for the DTO check.
   */
  private parseDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is not a valid date.`);
    }

    return date;
  }

  /**
   * Validates a startAt/endAt/allDay triple that is always the fully
   * merged, final state — on create that's just the fresh input; on
   * update it's the existing event's values with whichever of the
   * three the caller actually touched substituted in (see
   * CalendarService.update). That is what makes "change only endAt"
   * correctly re-validate against the *current* startAt instead of
   * silently trusting a stale combination.
   */
  private validateTiming(startAt: Date, endAt: Date, allDay: boolean): void {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('endAt must be after startAt.');
    }

    const durationDays = (endAt.getTime() - startAt.getTime()) / MS_PER_DAY;
    if (durationDays > CALENDAR_MAX_EVENT_DURATION_DAYS) {
      throw new BadRequestException(
        `Event duration cannot exceed ${CALENDAR_MAX_EVENT_DURATION_DAYS} days.`,
      );
    }

    if (allDay && (!this.isUtcMidnight(startAt) || !this.isUtcMidnight(endAt))) {
      throw new BadRequestException(
        'All-day events must start and end at exact UTC midnight.',
      );
    }
  }

  private isUtcMidnight(date: Date): boolean {
    return (
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0
    );
  }

  /**
   * Compares the actual before/after entities rather than which
   * fields the patch happened to touch — mirrors TaskService's own
   * logUpdateEvents exactly for status/assignment, plus a third,
   * Calendar-specific check for a reschedule (startAt/endAt/allDay
   * actually changing value). A patch that resends a field's current
   * value (e.g. the same status, or the same startAt) is a no-op by
   * this measure and deliberately does not log anything — an Activity
   * feed entry should mean something actually changed, not that a
   * field appeared in the request body.
   */
  private async logUpdateEvents(
    companyId: string,
    actorId: string,
    before: CalendarEventEntity,
    after: CalendarEventEntity,
  ): Promise<void> {
    if (before.status !== after.status) {
      if (after.status === 'completed') {
        await this.activityService.logCalendarEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Calendar event completed: ${after.title}`,
          calendarEventId: after.id,
        });
      } else if (after.status === 'cancelled') {
        await this.activityService.logCalendarEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Calendar event cancelled: ${after.title}`,
          calendarEventId: after.id,
        });
      } else {
        await this.activityService.logCalendarEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Calendar event status changed to ${after.status}: ${after.title}`,
          calendarEventId: after.id,
        });
      }
    }

    if (before.assignedToId !== after.assignedToId) {
      if (after.assignedToId) {
        await this.activityService.logCalendarEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Calendar event assigned: ${after.title}`,
          calendarEventId: after.id,
        });
      } else {
        await this.activityService.logCalendarEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Calendar event unassigned: ${after.title}`,
          calendarEventId: after.id,
        });
      }
    }

    const rescheduled =
      before.startAt.getTime() !== after.startAt.getTime() ||
      before.endAt.getTime() !== after.endAt.getTime() ||
      before.allDay !== after.allDay;

    if (rescheduled) {
      await this.activityService.logCalendarEvent(companyId, actorId, {
        type: 'STATUS_CHANGE',
        title: `Calendar event rescheduled: ${after.title}`,
        calendarEventId: after.id,
      });
    }
  }
}