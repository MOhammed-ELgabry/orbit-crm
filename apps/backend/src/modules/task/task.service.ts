import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { TASK_REPOSITORY } from './constants/task.constants';

import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskEntity } from './entities/task.entity';

import type {
  ITaskRepository,
  TaskRepositoryResult,
} from './repository/task.repository.interface';

import { ActivityService } from '../activity/activity.service';
import { ContactService } from '../contact/contact.service';
import { LeadService } from '../lead/lead.service';
import { DealService } from '../deal/deal.service';
import { UserService } from '../user/user.service';

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: ITaskRepository,

    private readonly contactService: ContactService,
    private readonly leadService: LeadService,
    private readonly dealService: DealService,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Ensures a client-supplied assignedToId actually belongs to the
   * caller's own company before it's ever written — same pattern as
   * ContactService.assertAssignableInCompany / DealService's private
   * method of the same name. UserService.findById already enforces
   * company scoping (throws otherwise), so a cross-tenant id and a
   * nonexistent id are indistinguishable to the caller — neither is
   * accepted, and neither reveals whether the id exists elsewhere.
   */
  private async assertUserAssignableInCompany(
    assignedToId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.userService.findById(assignedToId, companyId);
    } catch {
      throw new NotFoundException(
        `assignedToId "${assignedToId}" does not reference a user in this company.`,
      );
    }
  }

  /** Same guarantee as assertUserAssignableInCompany, for contactId. */
  private async assertContactInCompany(
    contactId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.contactService.findById(companyId, contactId);
    } catch {
      throw new NotFoundException(
        `contactId "${contactId}" does not reference a contact in this company.`,
      );
    }
  }

  /** Same guarantee as assertUserAssignableInCompany, for leadId. */
  private async assertLeadInCompany(
    leadId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.leadService.findById(companyId, leadId);
    } catch {
      throw new NotFoundException(
        `leadId "${leadId}" does not reference a lead in this company.`,
      );
    }
  }

  /** Same guarantee as assertUserAssignableInCompany, for dealId. */
  private async assertDealInCompany(
    dealId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.dealService.findById(companyId, dealId);
    } catch {
      throw new NotFoundException(
        `dealId "${dealId}" does not reference a deal in this company.`,
      );
    }
  }

  private async assertRelations(
    companyId: string,
    dto: CreateTaskDto | UpdateTaskDto,
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

  async create(
    companyId: string,
    createdById: string,
    dto: CreateTaskDto,
  ): Promise<TaskEntity> {
    await this.assertRelations(companyId, dto);

    // The effective status is "todo" whenever the caller omits one —
    // matches the column's own @default("todo") — so completedAt is
    // derived from the same value the row will actually be created
    // with, not from dto.status directly (which may be undefined).
    const effectiveStatus = dto.status ?? 'todo';
    const completedAt = effectiveStatus === 'completed' ? new Date() : null;

    const task = await this.taskRepository.create(
      companyId,
      createdById,
      dto,
      completedAt,
    );

    await this.activityService.logTaskEvent(companyId, createdById, {
      type: 'SYSTEM',
      title: `Task created: ${task.title}`,
      taskId: task.id,
    });

    return task;
  }

  async findAll(
    companyId: string,
    query: TaskQueryDto,
  ): Promise<TaskRepositoryResult> {
    return this.taskRepository.findAll(companyId, query);
  }

  async findById(companyId: string, taskId: string): Promise<TaskEntity> {
    const task = await this.taskRepository.findById(companyId, taskId);

    if (!task) {
      throw new NotFoundException(`Task with ID "${taskId}" not found.`);
    }

    return task;
  }

  async update(
    companyId: string,
    taskId: string,
    dto: UpdateTaskDto,
    actorId: string,
  ): Promise<TaskEntity> {
    const existingTask = await this.taskRepository.findById(companyId, taskId);

    if (!existingTask) {
      throw new NotFoundException(`Task with ID "${taskId}" not found.`);
    }

    await this.assertRelations(companyId, dto);

    // undefined ("status wasn't part of this update") is distinct from
    // null/Date ("status changed, here is completedAt's new derived
    // value") — see ITaskRepository.update's doc comment.
    const completedAt: Date | null | undefined =
      dto.status !== undefined
        ? dto.status === 'completed'
          ? new Date()
          : null
        : undefined;

    const updatedTask = await this.taskRepository.update(
      companyId,
      taskId,
      dto,
      completedAt,
    );

    if (!updatedTask) {
      throw new NotFoundException(`Task with ID "${taskId}" not found.`);
    }

    await this.logUpdateEvents(companyId, actorId, existingTask, updatedTask);

    return updatedTask;
  }

  /**
   * Logs the specific, meaningful events an update can represent —
   * completed/cancelled/status-changed and assigned/unassigned —
   * instead of one generic "Task updated" for every PATCH regardless
   * of what changed. A field-value edit that doesn't touch status/
   * assignedToId (e.g. just the title or description) intentionally
   * logs nothing: it's a plain modification, not a state-transition/
   * audit-relevant event. Mirrors DealService.logUpdateEvents exactly.
   */
  private async logUpdateEvents(
    companyId: string,
    actorId: string,
    before: TaskEntity,
    after: TaskEntity,
  ): Promise<void> {
    if (before.status !== after.status) {
      if (after.status === 'completed') {
        await this.activityService.logTaskEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Task completed: ${after.title}`,
          taskId: after.id,
        });
      } else if (after.status === 'cancelled') {
        await this.activityService.logTaskEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Task cancelled: ${after.title}`,
          taskId: after.id,
        });
      } else {
        await this.activityService.logTaskEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Task status changed: ${before.status} \u2192 ${after.status}`,
          taskId: after.id,
        });
      }
    }

    if (before.assignedToId !== after.assignedToId) {
      await this.activityService.logTaskEvent(companyId, actorId, {
        type: 'SYSTEM',
        title: after.assignedToId ? 'Task assigned' : 'Task unassigned',
        taskId: after.id,
      });
    }
  }

  async remove(
    companyId: string,
    taskId: string,
    actorId: string,
  ): Promise<void> {
    const existingTask = await this.taskRepository.findById(companyId, taskId);

    if (!existingTask) {
      throw new NotFoundException(`Task with ID "${taskId}" not found.`);
    }

    const deleted = await this.taskRepository.softDelete(companyId, taskId);

    if (!deleted) {
      throw new NotFoundException(`Task with ID "${taskId}" not found.`);
    }

    // Logged with taskId still pointing at the just-deleted row — the
    // FK's SetNull only fires if the Task row itself is hard-deleted,
    // which this soft-delete never does, so the row this activity
    // targets still exists.
    await this.activityService.logTaskEvent(companyId, actorId, {
      type: 'SYSTEM',
      title: `Task deleted: ${existingTask.title}`,
      taskId: existingTask.id,
    });
  }
}
