import { NotFoundException } from '@nestjs/common';

import { TaskService } from './task.service';
import { TaskEntity } from './entities/task.entity';

describe('TaskService', () => {
  const companyId = 'company-1';
  const otherCompanyId = 'company-2';
  const createdById = 'user-1';
  const taskId = 'task-1';

  const baseTask = new TaskEntity({
    id: taskId,
    companyId,
    title: 'Call customer about renewal',
    description: null,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    completedAt: null,
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
    const taskRepository = {
      create: jest.fn().mockResolvedValue(baseTask),
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(baseTask),
      update: jest.fn().mockResolvedValue(baseTask),
      softDelete: jest.fn().mockResolvedValue(true),
    };

    // findById on each of these throws when the id doesn't resolve
    // within `companyId` — mirrors the real ContactService/LeadService/
    // DealService/UserService.findById contract (cross-tenant and
    // nonexistent are indistinguishable) exactly.
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
      logTaskEvent: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    };

    const service = new TaskService(
      taskRepository,
      contactService as never,
      leadService as never,
      dealService as never,
      userService as never,
      activityService as never,
    );

    return {
      service,
      taskRepository,
      contactService,
      leadService,
      dealService,
      userService,
      activityService,
    };
  }

  describe('create', () => {
    it('creates directly when no contact/lead/deal/assignedTo are supplied', async () => {
      const {
        service,
        taskRepository,
        contactService,
        leadService,
        dealService,
        userService,
      } = buildService();

      await service.create(companyId, createdById, { title: 'New task' });

      expect(contactService.findById).not.toHaveBeenCalled();
      expect(leadService.findById).not.toHaveBeenCalled();
      expect(dealService.findById).not.toHaveBeenCalled();
      expect(userService.findById).not.toHaveBeenCalled();
      expect(taskRepository.create).toHaveBeenCalledWith(
        companyId,
        createdById,
        { title: 'New task' },
        null, // no status supplied -> effective "todo" -> completedAt null
      );
    });

    it('validates contactId, leadId, dealId, and assignedToId against the caller company before creating', async () => {
      const {
        service,
        taskRepository,
        contactService,
        leadService,
        dealService,
        userService,
      } = buildService();

      await service.create(companyId, createdById, {
        title: 'New task',
        contactId: 'contact-1',
        leadId: 'lead-1',
        dealId: 'deal-1',
        assignedToId: 'user-2',
      });

      expect(contactService.findById).toHaveBeenCalledWith(
        companyId,
        'contact-1',
      );
      expect(leadService.findById).toHaveBeenCalledWith(companyId, 'lead-1');
      expect(dealService.findById).toHaveBeenCalledWith(companyId, 'deal-1');
      expect(userService.findById).toHaveBeenCalledWith('user-2', companyId);
      expect(taskRepository.create).toHaveBeenCalled();
    });

    it('rejects a contactId belonging to another company (IDOR) without ever calling the repository', async () => {
      const { service, taskRepository, contactService } = buildService();
      contactService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(companyId, createdById, {
          title: 'New task',
          contactId: 'contact-from-other-company',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a leadId belonging to another company without ever calling the repository', async () => {
      const { service, taskRepository, leadService } = buildService();
      leadService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(companyId, createdById, {
          title: 'New task',
          leadId: 'lead-from-other-company',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a dealId belonging to another company without ever calling the repository', async () => {
      const { service, taskRepository, dealService } = buildService();
      dealService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(companyId, createdById, {
          title: 'New task',
          dealId: 'deal-from-other-company',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an assignedToId belonging to another company without ever calling the repository', async () => {
      const { service, taskRepository, userService } = buildService();
      userService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create(companyId, createdById, {
          title: 'New task',
          assignedToId: 'user-from-other-company',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('derives completedAt as a Date when created directly with status "completed"', async () => {
      const { service, taskRepository } = buildService();

      await service.create(companyId, createdById, {
        title: 'Retroactively logged task',
        status: 'completed',
      });

      expect(taskRepository.create).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ status: 'completed' }),
        expect.any(Date),
      );
    });

    it('logs a SYSTEM "Task created" activity after a successful create', async () => {
      const { service, activityService } = buildService();

      await service.create(companyId, createdById, { title: 'New task' });

      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', taskId: baseTask.id }),
      );
    });
  });

  describe('findById', () => {
    it('returns the task when the repository finds it within the company', async () => {
      const { service } = buildService();

      await expect(service.findById(companyId, taskId)).resolves.toBe(baseTask);
    });

    it('throws NotFoundException when the repository finds nothing — the same 404 a cross-company id or an unknown id both produce', async () => {
      const { service, taskRepository } = buildService();
      taskRepository.findById.mockResolvedValue(null);

      await expect(service.findById(otherCompanyId, taskId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it("404s before validating relations when the task doesn't exist in this company", async () => {
      const { service, taskRepository, contactService } = buildService();
      taskRepository.findById.mockResolvedValue(null);

      await expect(
        service.update(
          companyId,
          taskId,
          { contactId: 'contact-1' },
          createdById,
        ),
      ).rejects.toThrow(NotFoundException);

      // Never even got to checking the contact — the task lookup fails first.
      expect(contactService.findById).not.toHaveBeenCalled();
      expect(taskRepository.update).not.toHaveBeenCalled();
    });

    it('validates a newly-supplied contactId/leadId/dealId/assignedToId the same way create does', async () => {
      const { service, taskRepository, dealService } = buildService();
      dealService.findById.mockRejectedValue(new NotFoundException());

      await expect(
        service.update(
          companyId,
          taskId,
          { dealId: 'deal-from-other-company' },
          createdById,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(taskRepository.update).not.toHaveBeenCalled();
    });

    it('updates once the task exists and any supplied relations are valid, leaving completedAt untouched when status is not part of the update', async () => {
      const { service, taskRepository } = buildService();

      await service.update(
        companyId,
        taskId,
        { title: 'Renamed' },
        createdById,
      );

      expect(taskRepository.update).toHaveBeenCalledWith(
        companyId,
        taskId,
        { title: 'Renamed' },
        undefined,
      );
    });

    it('passes a Date for completedAt and logs "Task completed" when status changes to completed', async () => {
      const { service, taskRepository, activityService } = buildService();
      taskRepository.update.mockResolvedValue(
        new TaskEntity({ ...baseTask, status: 'completed' }),
      );

      await service.update(
        companyId,
        taskId,
        { status: 'completed' },
        createdById,
      );

      expect(taskRepository.update).toHaveBeenCalledWith(
        companyId,
        taskId,
        { status: 'completed' },
        expect.any(Date),
      );
      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({
          type: 'STATUS_CHANGE',
          title: expect.stringContaining('completed'),
        }),
      );
    });

    it('passes null for completedAt and logs "Task cancelled" when status changes to cancelled', async () => {
      const { service, taskRepository, activityService } = buildService();
      taskRepository.update.mockResolvedValue(
        new TaskEntity({ ...baseTask, status: 'cancelled' }),
      );

      await service.update(
        companyId,
        taskId,
        { status: 'cancelled' },
        createdById,
      );

      expect(taskRepository.update).toHaveBeenCalledWith(
        companyId,
        taskId,
        { status: 'cancelled' },
        null,
      );
      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({
          type: 'STATUS_CHANGE',
          title: expect.stringContaining('cancelled'),
        }),
      );
    });

    it('clears completedAt back to null when status moves off completed (e.g. reopened to todo)', async () => {
      const { service, taskRepository } = buildService();
      taskRepository.findById.mockResolvedValue(
        new TaskEntity({
          ...baseTask,
          status: 'completed',
          completedAt: new Date(),
        }),
      );
      taskRepository.update.mockResolvedValue(
        new TaskEntity({ ...baseTask, status: 'todo', completedAt: null }),
      );

      await service.update(companyId, taskId, { status: 'todo' }, createdById);

      expect(taskRepository.update).toHaveBeenCalledWith(
        companyId,
        taskId,
        { status: 'todo' },
        null,
      );
    });

    it('logs a generic status-changed event for a non-terminal status change', async () => {
      const { service, taskRepository, activityService } = buildService();
      taskRepository.update.mockResolvedValue(
        new TaskEntity({ ...baseTask, status: 'in_progress' }),
      );

      await service.update(
        companyId,
        taskId,
        { status: 'in_progress' },
        createdById,
      );

      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'STATUS_CHANGE' }),
      );
    });

    it('logs "Task assigned" when assignedToId changes from null to a user', async () => {
      const { service, taskRepository, activityService } = buildService();
      taskRepository.update.mockResolvedValue(
        new TaskEntity({ ...baseTask, assignedToId: 'user-2' }),
      );

      await service.update(
        companyId,
        taskId,
        { assignedToId: 'user-2' },
        createdById,
      );

      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', title: 'Task assigned' }),
      );
    });

    it('logs "Task unassigned" when assignedToId changes from a user to null', async () => {
      const { service, taskRepository, activityService } = buildService();
      taskRepository.findById.mockResolvedValue(
        new TaskEntity({ ...baseTask, assignedToId: 'user-2' }),
      );
      taskRepository.update.mockResolvedValue(
        new TaskEntity({ ...baseTask, assignedToId: null }),
      );

      await service.update(
        companyId,
        taskId,
        { assignedToId: null },
        createdById,
      );

      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', title: 'Task unassigned' }),
      );
    });

    it('does not log anything when neither status nor assignedToId actually changed', async () => {
      const { service, activityService } = buildService();

      await service.update(
        companyId,
        taskId,
        { title: 'Renamed' },
        createdById,
      );

      expect(activityService.logTaskEvent).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('succeeds and logs a "Task deleted" activity when the repository soft-deletes a row', async () => {
      const { service, activityService } = buildService();

      await expect(
        service.remove(companyId, taskId, createdById),
      ).resolves.toBeUndefined();

      expect(activityService.logTaskEvent).toHaveBeenCalledWith(
        companyId,
        createdById,
        expect.objectContaining({ type: 'SYSTEM', taskId: baseTask.id }),
      );
    });

    it("404s before deleting or logging anything when the task doesn't exist in this company", async () => {
      const { service, taskRepository, activityService } = buildService();
      taskRepository.findById.mockResolvedValue(null);

      await expect(
        service.remove(otherCompanyId, taskId, createdById),
      ).rejects.toThrow(NotFoundException);

      expect(taskRepository.softDelete).not.toHaveBeenCalled();
      expect(activityService.logTaskEvent).not.toHaveBeenCalled();
    });
  });
});
