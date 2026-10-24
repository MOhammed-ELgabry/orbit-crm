import { NotFoundException } from '@nestjs/common';

import { DealService } from './deal.service';
import { DealEntity } from './entities/deal.entity';
import type { AuditActor } from '../audit/audit.types';

const audit: AuditActor = { actorUserId: 'actor-1' };

describe('DealService', () => {
  const companyId = 'company-1';
  const otherCompanyId = 'company-2';
  const createdById = 'user-1';
  const dealId = 'deal-1';

  const baseDeal = new DealEntity({
    id: dealId,
    companyId,
    title: 'Acme renewal',
    amount: '1000.00',
    stage: 'new',
    notes: null,
    expectedCloseDate: null,
    contactId: null,
    leadId: null,
    createdById,
    assignedToId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

  function buildService() {
    const dealRepository = {
      create: jest.fn().mockResolvedValue(baseDeal),
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(baseDeal),
      update: jest.fn().mockResolvedValue(baseDeal),
      softDelete: jest.fn().mockResolvedValue(true),
    };

    // findById on each of these throws when the id doesn't resolve
    // within `companyId` — mirrors the real ContactService/LeadService/
    // UserService.findById contract (cross-tenant and nonexistent are
    // indistinguishable) exactly.
    const contactService = {
      findById: jest.fn().mockResolvedValue({ id: 'contact-1', companyId }),
    };
    const leadService = {
      findById: jest.fn().mockResolvedValue({ id: 'lead-1', companyId }),
    };
    const userService = {
      findById: jest.fn().mockResolvedValue({ id: 'user-2', companyId }),
    };
    const activityService = {
      logDealEvent: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    const notificationService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const service = new DealService(
      dealRepository as never,
      contactService as never,
      leadService as never,
      userService as never,
      activityService as never,
      notificationService as never,
    );

    return {
      service,
      dealRepository,
      contactService,
      leadService,
      userService,
      activityService,
      notificationService,
    };
  }

  describe('create', () => {
    it('creates directly when no contact/lead/assignedTo are supplied', async () => {
      const {
        service,
        dealRepository,
        contactService,
        leadService,
        userService,
      } = buildService();

      await service.create(
        companyId,
        createdById,
        { title: 'New deal' },
        audit,
      );

      expect(contactService.findById).not.toHaveBeenCalled();
      expect(leadService.findById).not.toHaveBeenCalled();
      expect(userService.findById).not.toHaveBeenCalled();
      expect(dealRepository.create).toHaveBeenCalledWith(
        companyId,
        createdById,
        { title: 'New deal' },
        audit,
      );
    });

    it('validates contactId, leadId, and assignedToId against the caller company before creating', async () => {
      const {
        service,
        dealRepository,
        contactService,
        leadService,
        userService,
      } = buildService();

      await service.create(
        companyId,
        createdById,
        {
          title: 'New deal',
          contactId: 'contact-1',
          leadId: 'lead-1',
          assignedToId: 'user-2',
        },
        audit,
      );

      expect(contactService.findById).toHaveBeenCalledWith(
        companyId,
        'contact-1',
      );
      expect(leadService.findById).toHaveBeenCalledWith(companyId, 'lead-1');
      expect(userService.findById).toHaveBeenCalledWith('user-2', companyId);
      expect(dealRepository.create).toHaveBeenCalled();
    });

    it('rejects a contactId belonging to another company (IDOR) without ever calling the repository', async () => {
      const { service, dealRepository, contactService } = buildService();
      contactService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(
          companyId,
          createdById,
          {
            title: 'New deal',
            contactId: 'contact-from-other-company',
          },
          audit,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(dealRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a leadId belonging to another company without ever calling the repository', async () => {
      const { service, dealRepository, leadService } = buildService();
      leadService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(
          companyId,
          createdById,
          {
            title: 'New deal',
            leadId: 'lead-from-other-company',
          },
          audit,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(dealRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an assignedToId belonging to another company without ever calling the repository', async () => {
      const { service, dealRepository, userService } = buildService();
      userService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(
          companyId,
          createdById,
          {
            title: 'New deal',
            assignedToId: 'user-from-other-company',
          },
          audit,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(dealRepository.create).not.toHaveBeenCalled();
    });

    it('logs a SYSTEM "Deal created" activity after a successful create', async () => {
      const { service, activityService } = buildService();

      await service.create(
        companyId,
        createdById,
        { title: 'New deal' },
        audit,
      );

      expect(activityService.logDealEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', dealId: baseDeal.id }),
      );
    });
  });

  describe('findById', () => {
    it('returns the deal when the repository finds it within the company', async () => {
      const { service } = buildService();

      await expect(service.findById(companyId, dealId)).resolves.toBe(baseDeal);
    });

    it('throws NotFoundException when the repository finds nothing — the same 404 a cross-company id or an unknown id both produce', async () => {
      const { service, dealRepository } = buildService();
      dealRepository.findById.mockResolvedValue(null);

      await expect(service.findById(otherCompanyId, dealId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it("404s before validating relations when the deal doesn't exist in this company", async () => {
      const { service, dealRepository, contactService } = buildService();
      dealRepository.findById.mockResolvedValue(null);

      await expect(
        service.update(
          companyId,
          dealId,
          { contactId: 'contact-1' },
          createdById,
          audit,
        ),
      ).rejects.toThrow(NotFoundException);

      // Never even got to checking the contact — the deal lookup fails first.
      expect(contactService.findById).not.toHaveBeenCalled();
      expect(dealRepository.update).not.toHaveBeenCalled();
    });

    it('validates a newly-supplied contactId/leadId/assignedToId the same way create does', async () => {
      const { service, dealRepository, contactService } = buildService();
      contactService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.update(
          companyId,
          dealId,
          { contactId: 'contact-from-other-company' },
          createdById,
          audit,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(dealRepository.update).not.toHaveBeenCalled();
    });

    it('updates once the deal exists and any supplied relations are valid', async () => {
      const { service, dealRepository } = buildService();

      await service.update(
        companyId,
        dealId,
        { title: 'Renamed' },
        createdById,
        audit,
      );

      expect(dealRepository.update).toHaveBeenCalledWith(
        companyId,
        dealId,
        {
          title: 'Renamed',
        },
        audit,
      );
    });

    it('logs "Deal won" when stage changes to closed_won, and nothing for an unrelated field edit', async () => {
      const { service, dealRepository, activityService } = buildService();
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, stage: 'closed_won' }),
      );

      await service.update(
        companyId,
        dealId,
        { stage: 'closed_won' },
        createdById,
        audit,
      );

      expect(activityService.logDealEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({
          type: 'STATUS_CHANGE',
          title: expect.stringContaining('won'),
        }),
      );
    });

    it('logs "Deal lost" when stage changes to closed_lost', async () => {
      const { service, dealRepository, activityService } = buildService();
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, stage: 'closed_lost' }),
      );

      await service.update(
        companyId,
        dealId,
        { stage: 'closed_lost' },
        createdById,
        audit,
      );

      expect(activityService.logDealEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({
          type: 'STATUS_CHANGE',
          title: expect.stringContaining('lost'),
        }),
      );
    });

    it('logs a generic stage-changed event for a non-terminal stage change', async () => {
      const { service, dealRepository, activityService } = buildService();
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, stage: 'proposal' }),
      );

      await service.update(
        companyId,
        dealId,
        { stage: 'proposal' },
        createdById,
        audit,
      );

      expect(activityService.logDealEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'STATUS_CHANGE' }),
      );
    });

    it('logs "Deal assigned" when assignedToId changes from null to a user', async () => {
      const { service, dealRepository, activityService } = buildService();
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: 'user-2' }),
      );

      await service.update(
        companyId,
        dealId,
        { assignedToId: 'user-2' },
        createdById,
        audit,
      );

      expect(activityService.logDealEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', title: 'Deal assigned' }),
      );
    });

    it('does not log anything when neither stage nor assignedToId actually changed', async () => {
      const { service, activityService } = buildService();

      await service.update(
        companyId,
        dealId,
        { title: 'Renamed' },
        createdById,
        audit,
      );

      expect(activityService.logDealEvent).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('succeeds and logs a "Deal deleted" activity when the repository soft-deletes a row', async () => {
      const { service, activityService } = buildService();

      await expect(
        service.remove(companyId, dealId, createdById, audit),
      ).resolves.toBeUndefined();

      expect(activityService.logDealEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', dealId: baseDeal.id }),
      );
    });

    it("404s before deleting or logging anything when the deal doesn't exist in this company", async () => {
      const { service, dealRepository, activityService } = buildService();
      dealRepository.findById.mockResolvedValue(null);

      await expect(
        service.remove(otherCompanyId, dealId, createdById, audit),
      ).rejects.toThrow(NotFoundException);

      expect(dealRepository.softDelete).not.toHaveBeenCalled();
      expect(activityService.logDealEvent).not.toHaveBeenCalled();
    });
  });

  describe('notifications (publish contract derived from DealService)', () => {
    it('create: publishes deal.assigned to the assignee only when the created deal has an assignee', async () => {
      const { service, dealRepository, notificationService } = buildService();
      dealRepository.create.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: 'user-2' }),
      );

      await service.create(
        companyId,
        createdById,
        {
          title: 'New deal',
          assignedToId: 'user-2',
        },
        audit,
      );

      expect(notificationService.publish).toHaveBeenCalledTimes(1);
      expect(notificationService.publish).toHaveBeenCalledWith({
        type: 'deal.assigned',
        companyId,
        actorId: createdById,
        recipientIds: ['user-2'],
        entityType: 'deal',
        entityId: dealId,
        title: baseDeal.title,
        occurrenceId: 'activity-1',
      });
    });

    it('create: publishes nothing when the created deal has no assignee', async () => {
      const { service, notificationService } = buildService();

      await service.create(
        companyId,
        createdById,
        { title: 'New deal' },
        audit,
      );

      expect(notificationService.publish).not.toHaveBeenCalled();
    });

    it('update to closed_won: publishes deal.won to the creator and the owner, keyed on the transition Activity', async () => {
      const { service, dealRepository, notificationService } = buildService();
      dealRepository.findById.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: 'user-2' }),
      );
      dealRepository.update.mockResolvedValue(
        new DealEntity({
          ...baseDeal,
          assignedToId: 'user-2',
          stage: 'closed_won',
        }),
      );

      await service.update(
        companyId,
        dealId,
        { stage: 'closed_won' },
        'user-3',
        audit,
      );

      expect(notificationService.publish).toHaveBeenCalledTimes(1);
      expect(notificationService.publish).toHaveBeenCalledWith({
        type: 'deal.won',
        companyId,
        actorId: 'user-3',
        recipientIds: [createdById, 'user-2'],
        entityType: 'deal',
        entityId: dealId,
        title: baseDeal.title,
        occurrenceId: 'activity-1',
      });
    });

    it('update to closed_lost: publishes deal.lost to the creator and the owner', async () => {
      const { service, dealRepository, notificationService } = buildService();
      dealRepository.findById.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: 'user-2' }),
      );
      dealRepository.update.mockResolvedValue(
        new DealEntity({
          ...baseDeal,
          assignedToId: 'user-2',
          stage: 'closed_lost',
        }),
      );

      await service.update(
        companyId,
        dealId,
        { stage: 'closed_lost' },
        'user-3',
        audit,
      );

      expect(notificationService.publish).toHaveBeenCalledTimes(1);
      expect(notificationService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deal.lost',
          actorId: 'user-3',
          recipientIds: [createdById, 'user-2'],
          occurrenceId: 'activity-1',
        }),
      );
    });

    it('update to a non-terminal stage: publishes nothing', async () => {
      const { service, dealRepository, notificationService } = buildService();
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, stage: 'proposal' }),
      );

      await service.update(
        companyId,
        dealId,
        { stage: 'proposal' },
        createdById,
        audit,
      );

      expect(notificationService.publish).not.toHaveBeenCalled();
    });

    it('update that assigns a user: publishes deal.assigned to that user only', async () => {
      const { service, dealRepository, notificationService } = buildService();
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: 'user-2' }),
      );

      await service.update(
        companyId,
        dealId,
        { assignedToId: 'user-2' },
        createdById,
        audit,
      );

      expect(notificationService.publish).toHaveBeenCalledTimes(1);
      expect(notificationService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deal.assigned',
          recipientIds: ['user-2'],
          occurrenceId: 'activity-1',
        }),
      );
    });

    it('update that unassigns: publishes nothing (only an assignment notifies)', async () => {
      const { service, dealRepository, notificationService } = buildService();
      dealRepository.findById.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: 'user-2' }),
      );
      dealRepository.update.mockResolvedValue(
        new DealEntity({ ...baseDeal, assignedToId: null }),
      );

      await service.update(
        companyId,
        dealId,
        { assignedToId: null },
        createdById,
        audit,
      );

      expect(notificationService.publish).not.toHaveBeenCalled();
    });

    it('update that changes only unrelated fields: publishes nothing', async () => {
      const { service, notificationService } = buildService();

      await service.update(
        companyId,
        dealId,
        { title: 'Renamed' },
        createdById,
        audit,
      );

      expect(notificationService.publish).not.toHaveBeenCalled();
    });
  });
});
