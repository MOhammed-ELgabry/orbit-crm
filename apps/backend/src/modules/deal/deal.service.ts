import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { DEAL_REPOSITORY } from './constants/deal.constants';

import { CreateDealDto } from './dto/create-deal.dto';
import { DealQueryDto } from './dto/deal-query.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { DealEntity } from './entities/deal.entity';

import type {
  IDealRepository,
  DealRepositoryResult,
} from './repository/deal.repository.interface';

import { ActivityService } from '../activity/activity.service';
import { ContactService } from '../contact/contact.service';
import { LeadService } from '../lead/lead.service';
import { UserService } from '../user/user.service';

@Injectable()
export class DealService {
  constructor(
    @Inject(DEAL_REPOSITORY)
    private readonly dealRepository: IDealRepository,

    private readonly contactService: ContactService,
    private readonly leadService: LeadService,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Ensures a client-supplied assignedToId actually belongs to the
   * caller's own company before it's ever written — same pattern as
   * ContactService.assertAssignableInCompany / LeadService's private
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

  private async assertRelations(
    companyId: string,
    dto: CreateDealDto | UpdateDealDto,
  ): Promise<void> {
    if (dto.contactId) {
      await this.assertContactInCompany(dto.contactId, companyId);
    }
    if (dto.leadId) {
      await this.assertLeadInCompany(dto.leadId, companyId);
    }
    if (dto.assignedToId) {
      await this.assertUserAssignableInCompany(dto.assignedToId, companyId);
    }
  }

  async create(
    companyId: string,
    createdById: string,
    dto: CreateDealDto,
  ): Promise<DealEntity> {
    await this.assertRelations(companyId, dto);

    const deal = await this.dealRepository.create(companyId, createdById, dto);

    await this.activityService.logDealEvent(companyId, createdById, {
      type: 'SYSTEM',
      title: `Deal created: ${deal.title}`,
      dealId: deal.id,
    });

    return deal;
  }

  async findAll(
    companyId: string,
    query: DealQueryDto,
  ): Promise<DealRepositoryResult> {
    return this.dealRepository.findAll(companyId, query);
  }

  async findById(companyId: string, dealId: string): Promise<DealEntity> {
    const deal = await this.dealRepository.findById(companyId, dealId);

    if (!deal) {
      throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
    }

    return deal;
  }

  async update(
    companyId: string,
    dealId: string,
    dto: UpdateDealDto,
    actorId: string,
  ): Promise<DealEntity> {
    const existingDeal = await this.dealRepository.findById(companyId, dealId);

    if (!existingDeal) {
      throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
    }

    await this.assertRelations(companyId, dto);

    const updatedDeal = await this.dealRepository.update(
      companyId,
      dealId,
      dto,
    );

    if (!updatedDeal) {
      throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
    }

    await this.logUpdateEvents(companyId, actorId, existingDeal, updatedDeal);

    return updatedDeal;
  }

  /**
   * Logs the specific, meaningful events an update can represent —
   * won/lost/stage-changed and assigned/unassigned — instead of one
   * generic "Deal updated" for every PATCH regardless of what changed.
   * A field-value edit that doesn't touch stage/assignedToId (e.g. just
   * the title or amount) intentionally logs nothing: it's a plain
   * modification, not a state-transition/audit-relevant event.
   */
  private async logUpdateEvents(
    companyId: string,
    actorId: string,
    before: DealEntity,
    after: DealEntity,
  ): Promise<void> {
    if (before.stage !== after.stage) {
      if (after.stage === 'closed_won') {
        await this.activityService.logDealEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Deal won: ${after.title}`,
          dealId: after.id,
        });
      } else if (after.stage === 'closed_lost') {
        await this.activityService.logDealEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Deal lost: ${after.title}`,
          dealId: after.id,
        });
      } else {
        await this.activityService.logDealEvent(companyId, actorId, {
          type: 'STATUS_CHANGE',
          title: `Deal stage changed: ${before.stage} \u2192 ${after.stage}`,
          dealId: after.id,
        });
      }
    }

    if (before.assignedToId !== after.assignedToId) {
      await this.activityService.logDealEvent(companyId, actorId, {
        type: 'SYSTEM',
        title: after.assignedToId ? 'Deal assigned' : 'Deal unassigned',
        dealId: after.id,
      });
    }
  }

  async remove(
    companyId: string,
    dealId: string,
    actorId: string,
  ): Promise<void> {
    const existingDeal = await this.dealRepository.findById(companyId, dealId);

    if (!existingDeal) {
      throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
    }

    const deleted = await this.dealRepository.softDelete(companyId, dealId);

    if (!deleted) {
      throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
    }

    // Logged with dealId still pointing at the just-deleted row — the
    // FK's SetNull only fires if the Deal row itself is hard-deleted,
    // which this soft-delete never does, so the row this activity
    // targets still exists.
    await this.activityService.logDealEvent(companyId, actorId, {
      type: 'SYSTEM',
      title: `Deal deleted: ${existingDeal.title}`,
      dealId: existingDeal.id,
    });
  }
}
