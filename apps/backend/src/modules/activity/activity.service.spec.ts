import { NotFoundException } from '@nestjs/common';

import { ContactService } from '../contact/contact.service';

import { ActivityService } from './activity.service';
import { ActivityEntity } from './entities/activity.entity';
import type { IActivityRepository } from './repository/activity.repository.interface';

/**
 * Tenant-isolation and cross-entity-association tests for ActivityService.
 *
 * ActivityRepository always scopes reads/updates/deletes by companyId (see
 * activity.repository.ts) and never accepts an id lookup without it, so a
 * cross-tenant attempt looks identical to "not found" from the service's
 * point of view — the repository returns null exactly as it would for a
 * nonexistent id. These tests verify the service turns that into a 404,
 * and that a contactId can never be used to attach an activity to another
 * tenant's Contact.
 */
describe('ActivityService', () => {
  let service: ActivityService;
  let activityRepository: jest.Mocked<IActivityRepository>;
  let contactService: jest.Mocked<Pick<ContactService, 'findById'>>;

  const companyId = 'company-a';
  const callerId = 'user-1';
  const activityId = 'activity-1';
  const contactId = 'contact-1';

  const activity = new ActivityEntity({
    id: activityId,
    companyId,
    type: 'NOTE',
    title: 'Test note',
    description: null,
    occurredAt: new Date(),
    createdById: callerId,
    contactId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

  beforeEach(() => {
    activityRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    contactService = {
      findById: jest.fn(),
    };

    service = new ActivityService(
      activityRepository,
      contactService as unknown as ContactService,
    );
  });

  describe('tenant isolation', () => {
    it('findById() throws NotFoundException on a cross-tenant/nonexistent activity', async () => {
      activityRepository.findById.mockResolvedValue(null);

      await expect(
        service.findById(companyId, activityId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(activityRepository.findById).toHaveBeenCalledWith(
        companyId,
        activityId,
      );
    });

    it('update() throws NotFoundException instead of updating when the activity is not in this company', async () => {
      activityRepository.findById.mockResolvedValue(null);

      await expect(
        service.update(companyId, activityId, { title: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(activityRepository.update).not.toHaveBeenCalled();
    });

    it('remove() throws NotFoundException instead of deleting when the activity is not in this company', async () => {
      activityRepository.softDelete.mockResolvedValue(false);

      await expect(
        service.remove(companyId, activityId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('findAll() always scopes by the authenticated companyId', async () => {
      activityRepository.findAll.mockResolvedValue({
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      await service.findAll(companyId, {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      } as never);

      expect(activityRepository.findAll).toHaveBeenCalledWith(
        companyId,
        expect.anything(),
      );
    });
  });

  describe('cross-tenant association (contactId)', () => {
    it("create() rejects a contactId that does not resolve in the caller's company", async () => {
      // ContactService.findById throws NotFoundException itself for both
      // "doesn't exist" and "belongs to another company" — indistinguishable
      // by design.
      contactService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(companyId, callerId, {
          type: 'NOTE',
          title: 'Should fail',
          contactId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(contactService.findById).toHaveBeenCalledWith(
        companyId,
        contactId,
      );
      expect(activityRepository.create).not.toHaveBeenCalled();
    });

    it("create() succeeds when contactId belongs to the caller's company", async () => {
      contactService.findById.mockResolvedValue({} as never);
      activityRepository.create.mockResolvedValue(activity);

      await service.create(companyId, callerId, {
        type: 'NOTE',
        title: 'Fine',
        contactId,
      });

      expect(activityRepository.create).toHaveBeenCalledWith(
        companyId,
        callerId,
        expect.objectContaining({ contactId }),
      );
    });

    it("update() rejects re-pointing contactId to another company's contact", async () => {
      activityRepository.findById.mockResolvedValue(activity);
      contactService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.update(companyId, activityId, {
          contactId: 'contact-in-company-b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(activityRepository.update).not.toHaveBeenCalled();
    });

    it('create() does not validate contactId when none is supplied', async () => {
      activityRepository.create.mockResolvedValue(activity);

      await service.create(companyId, callerId, {
        type: 'NOTE',
        title: 'No contact',
      });

      expect(contactService.findById).not.toHaveBeenCalled();
    });
  });

  describe('CRUD', () => {
    it('findById() returns the activity when found in this company', async () => {
      activityRepository.findById.mockResolvedValue(activity);

      await expect(service.findById(companyId, activityId)).resolves.toBe(
        activity,
      );
    });

    it('update() applies changes when the activity exists and any contactId is valid', async () => {
      activityRepository.findById.mockResolvedValue(activity);
      activityRepository.update.mockResolvedValue({
        ...activity,
        title: 'Updated',
      } as ActivityEntity);

      const result = await service.update(companyId, activityId, {
        title: 'Updated',
      });

      expect(result.title).toBe('Updated');
      expect(activityRepository.update).toHaveBeenCalledWith(
        companyId,
        activityId,
        expect.objectContaining({ title: 'Updated' }),
      );
    });

    it('remove() succeeds when the repository reports a row was soft-deleted', async () => {
      activityRepository.softDelete.mockResolvedValue(true);

      await expect(
        service.remove(companyId, activityId),
      ).resolves.toBeUndefined();
    });
  });
});
