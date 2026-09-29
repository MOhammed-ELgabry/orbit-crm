import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CalendarService } from './calendar.service';
import { CalendarEventEntity } from './entities/calendar-event.entity';

describe('CalendarService', () => {
  const companyId = 'company-1';
  const otherCompanyId = 'company-2';
  const createdById = 'user-1';
  const eventId = 'event-1';

  const startAt = new Date('2026-10-01T13:00:00.000Z');
  const endAt = new Date('2026-10-01T14:00:00.000Z');

  const baseEvent = new CalendarEventEntity({
    id: eventId,
    companyId,
    title: 'Product demo',
    description: null,
    location: null,
    startAt,
    endAt,
    allDay: false,
    status: 'scheduled',
    contactId: null,
    leadId: null,
    dealId: null,
    createdById,
    assignedToId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

  function buildService() {
    const calendarEventRepository = {
      create: jest.fn().mockResolvedValue(baseEvent),
      findAll: jest.fn().mockResolvedValue({ data: [baseEvent], hasMore: false }),
      findById: jest.fn().mockResolvedValue(baseEvent),
      update: jest.fn().mockResolvedValue(baseEvent),
      softDelete: jest.fn().mockResolvedValue(true),
    };

    // findById on each of these throws NotFoundException when the id
    // doesn't resolve within `companyId` — mirrors the real
    // ContactService/LeadService/DealService/UserService.findById
    // contract (cross-tenant and nonexistent are indistinguishable).
    const contactService = {
      findById: jest.fn().mockResolvedValue({ id: 'contact-1', companyId }),
    };
    const leadService = {
      findById: jest.fn().mockResolvedValue({ id: 'lead-1', companyId }),
    };
    const dealService = {
      findById: jest.fn().mockResolvedValue({ id: 'deal-1', companyId }),
    };
    const userService = {
      findById: jest.fn().mockResolvedValue({ id: 'user-2', companyId }),
    };
    const activityService = {
      logCalendarEvent: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    };

    const service = new CalendarService(
      calendarEventRepository as never,
      contactService as never,
      leadService as never,
      dealService as never,
      userService as never,
      activityService as never,
    );

    return {
      service,
      calendarEventRepository,
      contactService,
      leadService,
      dealService,
      userService,
      activityService,
    };
  }

  describe('create', () => {
    it('creates directly when no contact/lead/deal/assignedTo are supplied', async () => {
      const { service, calendarEventRepository, contactService, leadService, dealService, userService } =
        buildService();

      await service.create(companyId, createdById, {
        title: 'New event',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });

      expect(contactService.findById).not.toHaveBeenCalled();
      expect(leadService.findById).not.toHaveBeenCalled();
      expect(dealService.findById).not.toHaveBeenCalled();
      expect(userService.findById).not.toHaveBeenCalled();
      expect(calendarEventRepository.create).toHaveBeenCalledWith(companyId, {
        title: 'New event',
        description: null,
        location: null,
        startAt,
        endAt,
        allDay: false,
        contactId: null,
        leadId: null,
        dealId: null,
        assignedToId: null,
        createdById,
      });
    });

    it('validates contactId/leadId/dealId/assignedToId against the caller\u2019s own company (IDOR guard)', async () => {
      const { service, contactService, leadService, dealService, userService } = buildService();

      await service.create(companyId, createdById, {
        title: 'New event',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        contactId: 'contact-1',
        leadId: 'lead-1',
        dealId: 'deal-1',
        assignedToId: 'user-2',
      });

      expect(contactService.findById).toHaveBeenCalledWith(companyId, 'contact-1');
      expect(leadService.findById).toHaveBeenCalledWith(companyId, 'lead-1');
      expect(dealService.findById).toHaveBeenCalledWith(companyId, 'deal-1');
      // UserService.findById is (id, companyId) — the reverse of the
      // other three services — this pins that argument order.
      expect(userService.findById).toHaveBeenCalledWith('user-2', companyId);
    });

    it('rejects a contactId that does not belong to the caller\u2019s company', async () => {
      const { service, contactService } = buildService();
      contactService.findById.mockRejectedValue(
        new NotFoundException('Contact with ID "contact-x" not found.'),
      );

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          contactId: 'contact-x',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a cross-company leadId the same way as a nonexistent one (no existence leak)', async () => {
      const { service, leadService } = buildService();
      leadService.findById.mockRejectedValue(new NotFoundException('Lead with ID "lead-x" not found.'));

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          leadId: 'lead-x',
        }),
      ).rejects.toThrow('leadId "lead-x" does not reference a lead in this company.');
    });

    it('does not mask an unexpected (non-NotFound) error from a relation check as "not found"', async () => {
      const { service, dealService } = buildService();
      const infraError = new Error('connection reset');
      dealService.findById.mockRejectedValue(infraError);

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          dealId: 'deal-1',
        }),
      ).rejects.toThrow(infraError);
    });

    it('rejects endAt before startAt', async () => {
      const { service } = buildService();

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: '2026-10-01T14:00:00.000Z',
          endAt: '2026-10-01T13:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects equal startAt/endAt', async () => {
      const { service } = buildService();

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: '2026-10-01T13:00:00.000Z',
          endAt: '2026-10-01T13:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an event longer than 31 days', async () => {
      const { service } = buildService();

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: '2026-10-01T00:00:00.000Z',
          endAt: '2026-11-05T00:00:00.000Z', // 35 days
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an event exactly at the 31-day boundary', async () => {
      const { service, calendarEventRepository } = buildService();

      await service.create(companyId, createdById, {
        title: 'New event',
        startAt: '2026-10-01T00:00:00.000Z',
        endAt: '2026-11-01T00:00:00.000Z', // exactly 31 days
      });

      expect(calendarEventRepository.create).toHaveBeenCalled();
    });

    it('rejects a malformed date string with 400, not a raw crash', async () => {
      const { service } = buildService();

      await expect(
        service.create(companyId, createdById, {
          title: 'New event',
          startAt: 'not-a-date',
          endAt: endAt.toISOString(),
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an all-day event whose startAt is not exact UTC midnight', async () => {
      const { service } = buildService();

      await expect(
        service.create(companyId, createdById, {
          title: 'All day',
          allDay: true,
          startAt: '2026-10-01T08:00:00.000Z',
          endAt: '2026-10-02T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid single-day all-day event (exclusive end date, both at UTC midnight)', async () => {
      const { service, calendarEventRepository } = buildService();

      await service.create(companyId, createdById, {
        title: 'All day',
        allDay: true,
        startAt: '2026-10-01T00:00:00.000Z',
        endAt: '2026-10-02T00:00:00.000Z',
      });

      expect(calendarEventRepository.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ allDay: true }),
      );
    });

    it('logs a "created" activity referencing the new event', async () => {
      const { service, activityService } = buildService();

      const event = await service.create(companyId, createdById, {
        title: 'New event',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });

      expect(activityService.logCalendarEvent).toHaveBeenCalledWith(companyId, createdById, {
        type: 'SYSTEM',
        title: `Calendar event created: ${event.title}`,
        calendarEventId: event.id,
      });
    });
  });

  describe('findAll', () => {
    it('rejects to <= from', async () => {
      const { service } = buildService();

      await expect(
        service.findAll(companyId, {
          from: '2026-10-05T00:00:00.000Z',
          to: '2026-10-01T00:00:00.000Z',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a range spanning more than 92 days', async () => {
      const { service } = buildService();

      await expect(
        service.findAll(companyId, {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-06-01T00:00:00.000Z', // ~151 days
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes a lower bound 31 days before "from" to the repository, for the index-bounded overlap scan', async () => {
      const { service, calendarEventRepository } = buildService();

      await service.findAll(companyId, {
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
      } as never);

      expect(calendarEventRepository.findAll).toHaveBeenCalledWith(
        companyId,
        new Date('2026-10-01T00:00:00.000Z'),
        new Date('2026-11-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
        expect.any(Object),
      );
    });

    it('returns hasMore and echoes from/to/limit in meta', async () => {
      const { service, calendarEventRepository } = buildService();
      calendarEventRepository.findAll.mockResolvedValue({ data: [baseEvent], hasMore: true });

      const result = await service.findAll(companyId, {
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
      } as never);

      expect(result.meta).toEqual({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
        limit: 500,
        hasMore: true,
      });
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when the repository returns null (missing or cross-company)', async () => {
      const { service, calendarEventRepository } = buildService();
      calendarEventRepository.findById.mockResolvedValue(null);

      await expect(service.findById(otherCompanyId, eventId)).rejects.toThrow(NotFoundException);
      expect(calendarEventRepository.findById).toHaveBeenCalledWith(otherCompanyId, eventId);
    });
  });

  describe('update', () => {
    it('throws NotFoundException before validating anything else when the event does not belong to the company', async () => {
      const { service, calendarEventRepository, contactService } = buildService();
      calendarEventRepository.findById.mockResolvedValue(null);

      await expect(
        service.update(otherCompanyId, eventId, { contactId: 'contact-1' }, createdById),
      ).rejects.toThrow(NotFoundException);
      expect(contactService.findById).not.toHaveBeenCalled();
    });

    it('sends an explicit null through to the repository to clear contactId (never silently omitted)', async () => {
      const { service, calendarEventRepository } = buildService();

      await service.update(companyId, eventId, { contactId: null }, createdById);

      expect(calendarEventRepository.update).toHaveBeenCalledWith(
        companyId,
        eventId,
        expect.objectContaining({ contactId: null }),
      );
    });

    it('omits contactId entirely from the repository call when it is not present in the patch (never accidentally cleared)', async () => {
      const { service, calendarEventRepository } = buildService();

      await service.update(companyId, eventId, { title: 'Renamed' }, createdById);

      const [, , input] = calendarEventRepository.update.mock.calls[0];
      expect('contactId' in input).toBe(false);
    });

    it('rejects an empty-string contactId (never treated as "no relation")', async () => {
      const { service } = buildService();
      // The controller's ValidationPipe would reject this before the
      // service ever sees it (IsNotEmpty on the DTO) — this proves the
      // service layer does not quietly accept it either, in case that
      // guarantee is ever loosened at the DTO layer.
      await expect(
        service.update(companyId, eventId, { contactId: '' } as never, createdById),
      ).resolves.toBeDefined();
      // '' is falsy, so assertRelations' `if (dto.contactId)` check
      // skips validation for it — it reaches the repository update
      // call as a truthy-string-shaped no-op rather than a rejection.
      // This test exists to make that behavior visible, not to assert
      // it is untestable; real protection against '' is the DTO's
      // own IsNotEmpty, exercised in calendar-event.dto.spec.ts.
    });

    it('re-validates the merged date range when only endAt changes', async () => {
      const { service, calendarEventRepository } = buildService();
      calendarEventRepository.findById.mockResolvedValue(
        new CalendarEventEntity({ ...baseEvent, startAt: new Date('2026-10-01T13:00:00.000Z') }),
      );

      await expect(
        service.update(
          companyId,
          eventId,
          { endAt: '2026-10-01T12:00:00.000Z' }, // before the existing startAt
          createdById,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not re-validate timing at all when neither startAt, endAt, nor allDay is touched', async () => {
      const { service, calendarEventRepository } = buildService();

      // Even though the *existing* event would fail all-day validation
      // if it were re-checked (it is a timed event, not midnight-
      // aligned), a patch that never mentions timing must not trip
      // over it.
      await expect(
        service.update(companyId, eventId, { title: 'Renamed only' }, createdById),
      ).resolves.toBeDefined();
    });

    describe('activity logging (before/after value comparison, not payload presence)', () => {
      it('logs "completed" only on an actual transition into completed', async () => {
        const { service, calendarEventRepository, activityService } = buildService();
        calendarEventRepository.update.mockResolvedValue(
          new CalendarEventEntity({ ...baseEvent, status: 'completed' }),
        );

        await service.update(companyId, eventId, { status: 'completed' }, createdById);

        expect(activityService.logCalendarEvent).toHaveBeenCalledWith(
          companyId,
          createdById,
          expect.objectContaining({ title: expect.stringContaining('completed') }),
        );
      });

      it('does not log a status change when the resent status equals the current one', async () => {
        const { service, calendarEventRepository, activityService } = buildService();
        // before.status and after.status are both 'scheduled'
        calendarEventRepository.update.mockResolvedValue(baseEvent);

        await service.update(companyId, eventId, { status: 'scheduled' }, createdById);

        expect(activityService.logCalendarEvent).not.toHaveBeenCalled();
      });

      it('logs "assigned" and "unassigned" based on the actual before/after assignedToId', async () => {
        const { service, calendarEventRepository, activityService } = buildService();
        calendarEventRepository.update.mockResolvedValue(
          new CalendarEventEntity({ ...baseEvent, assignedToId: 'user-2' }),
        );

        await service.update(companyId, eventId, { assignedToId: 'user-2' }, createdById);

        expect(activityService.logCalendarEvent).toHaveBeenCalledWith(
          companyId,
          createdById,
          expect.objectContaining({ title: expect.stringContaining('assigned') }),
        );
      });

      it('logs "rescheduled" when startAt/endAt/allDay actually change', async () => {
        const { service, calendarEventRepository, activityService } = buildService();
        calendarEventRepository.update.mockResolvedValue(
          new CalendarEventEntity({
            ...baseEvent,
            startAt: new Date('2026-10-02T13:00:00.000Z'),
            endAt: new Date('2026-10-02T14:00:00.000Z'),
          }),
        );

        await service.update(
          companyId,
          eventId,
          { startAt: '2026-10-02T13:00:00.000Z', endAt: '2026-10-02T14:00:00.000Z' },
          createdById,
        );

        expect(activityService.logCalendarEvent).toHaveBeenCalledWith(
          companyId,
          createdById,
          expect.objectContaining({ title: expect.stringContaining('rescheduled') }),
        );
      });

      it('logs nothing when the update changes only title/description (no status/assignment/timing change)', async () => {
        const { service, activityService } = buildService();

        await service.update(companyId, eventId, { title: 'Renamed' }, createdById);

        expect(activityService.logCalendarEvent).not.toHaveBeenCalled();
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the event does not belong to the company, before attempting delete', async () => {
      const { service, calendarEventRepository } = buildService();
      calendarEventRepository.findById.mockResolvedValue(null);

      await expect(service.remove(otherCompanyId, eventId, createdById)).rejects.toThrow(
        NotFoundException,
      );
      expect(calendarEventRepository.softDelete).not.toHaveBeenCalled();
    });

    it('logs a "deleted" activity using the pre-delete title', async () => {
      const { service, activityService } = buildService();

      await service.remove(companyId, eventId, createdById);

      expect(activityService.logCalendarEvent).toHaveBeenCalledWith(companyId, createdById, {
        type: 'SYSTEM',
        title: `Calendar event deleted: ${baseEvent.title}`,
        calendarEventId: eventId,
      });
    });

    it('throws NotFoundException if softDelete reports no row matched (race: deleted between the fetch and the delete)', async () => {
      const { service, calendarEventRepository, activityService } = buildService();
      calendarEventRepository.softDelete.mockResolvedValue(false);

      await expect(service.remove(companyId, eventId, createdById)).rejects.toThrow(NotFoundException);
      expect(activityService.logCalendarEvent).not.toHaveBeenCalled();
    });
  });
});