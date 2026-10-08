import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { LEAD_REPOSITORY } from './constants/lead.constants';

import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadEntity } from './entities/lead.entity';

import type {
  ILeadRepository,
  LeadRepositoryResult,
} from './repository/lead.repository.interface';

import { UserService } from '../user/user.service';
import { NotificationService } from '../notification/notification.service';
import { buildLeadOccurrenceId } from '../notification/notification.policy';

@Injectable()
export class LeadService {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepository: ILeadRepository,

    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Ensures a client-supplied assignedToId actually belongs to the caller's
   * own company before it's ever written — same pattern as
   * ContactService.assertAssignableInCompany. UserService.findById already
   * enforces company scoping (throws NotFoundException otherwise), so a
   * cross-tenant id or a nonexistent id are indistinguishable to the caller
   * — neither is accepted, and neither reveals whether the id exists
   * elsewhere.
   */
  private async assertAssignableInCompany(
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

  async create(
    companyId: string,
    createdById: string,
    dto: CreateLeadDto,
  ): Promise<LeadEntity> {
    if (dto.assignedToId) {
      await this.assertAssignableInCompany(dto.assignedToId, companyId);
    }

    const lead = await this.leadRepository.create(companyId, createdById, dto);

    // Leads have no Activity log, so the occurrence is derived from the
    // persisted row (see buildLeadOccurrenceId). Never throws.
    if (lead.assignedToId) {
      await this.notificationService.publish({
        type: 'lead.assigned',
        companyId,
        actorId: createdById,
        recipientIds: [lead.assignedToId],
        entityType: 'lead',
        entityId: lead.id,
        title: `${lead.firstName} ${lead.lastName}`,
        occurrenceId: buildLeadOccurrenceId(
          lead.id,
          lead.assignedToId,
          lead.updatedAt,
        ),
      });
    }

    return lead;
  }

  async findAll(
    companyId: string,
    query: LeadQueryDto,
  ): Promise<LeadRepositoryResult> {
    return this.leadRepository.findAll(companyId, query);
  }

  async findById(companyId: string, leadId: string): Promise<LeadEntity> {
    const lead = await this.leadRepository.findById(companyId, leadId);

    if (!lead) {
      throw new NotFoundException(`Lead with ID "${leadId}" not found.`);
    }

    return lead;
  }

  async update(
    companyId: string,
    leadId: string,
    dto: UpdateLeadDto,
    actorId: string,
  ): Promise<LeadEntity> {
    const existingLead = await this.leadRepository.findById(companyId, leadId);

    if (!existingLead) {
      throw new NotFoundException(`Lead with ID "${leadId}" not found.`);
    }

    if (dto.assignedToId) {
      await this.assertAssignableInCompany(dto.assignedToId, companyId);
    }

    const updatedLead = await this.leadRepository.update(
      companyId,
      leadId,
      dto,
    );

    if (!updatedLead) {
      throw new NotFoundException(`Lead with ID "${leadId}" not found.`);
    }

    // Only a real change of owner to someone notifies (not a repeat PATCH
    // with the same assignee, not an unassignment). The occurrence is
    // <leadId>:<newAssignee>:<updatedAt of the row THIS update persisted>.
    if (
      updatedLead.assignedToId &&
      updatedLead.assignedToId !== existingLead.assignedToId
    ) {
      await this.notificationService.publish({
        type: 'lead.assigned',
        companyId,
        actorId,
        recipientIds: [updatedLead.assignedToId],
        entityType: 'lead',
        entityId: updatedLead.id,
        title: `${updatedLead.firstName} ${updatedLead.lastName}`,
        occurrenceId: buildLeadOccurrenceId(
          updatedLead.id,
          updatedLead.assignedToId,
          updatedLead.updatedAt,
        ),
      });
    }

    return updatedLead;
  }

  async remove(companyId: string, leadId: string): Promise<void> {
    const deleted = await this.leadRepository.softDelete(companyId, leadId);

    if (!deleted) {
      throw new NotFoundException(`Lead with ID "${leadId}" not found.`);
    }
  }
}