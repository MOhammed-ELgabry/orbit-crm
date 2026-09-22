import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ContactService } from '../contact/contact.service';

import { ACTIVITY_REPOSITORY } from './constants/activity.constants';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityEntity } from './entities/activity.entity';
import type {
  ActivityRepositoryResult,
  DealActivityEventInput,
  IActivityRepository,
} from './repository/activity.repository.interface';

@Injectable()
export class ActivityService {
  constructor(
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: IActivityRepository,

    private readonly contactService: ContactService,
  ) {}

  /**
   * Confirms a client-supplied contactId actually belongs to the caller's
   * own company before it's ever written to an Activity.
   *
   * ContactService.findById already scopes by companyId and throws
   * NotFoundException for anything outside it — a contact that belongs to
   * another tenant and a contact that doesn't exist at all are
   * indistinguishable to the caller, which is exactly what we want: no
   * signal is leaked about what exists in another company.
   */
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

  async create(
    companyId: string,
    createdById: string,
    dto: CreateActivityDto,
  ): Promise<ActivityEntity> {
    if (dto.contactId) {
      await this.assertContactInCompany(dto.contactId, companyId);
    }

    return this.activityRepository.create(companyId, createdById, dto);
  }

  /**
   * Logs a system-generated activity for a deal — DealService calls
   * this after create/update/delete so a deal's lifecycle shows up in
   * the same Activity model everything else uses (ACTIVITY_TYPES
   * already had 'SYSTEM' and 'STATUS_CHANGE' before Deal existed).
   *
   * Deliberately not reachable from ActivityController / the public
   * CreateActivityDto: `input.dealId` is trusted here precisely because
   * the only caller is DealService, which has already loaded/confirmed
   * that exact deal within `companyId` as part of the same request —
   * unlike CreateActivityDto.contactId above, there is no untrusted
   * client input to re-validate. Never call this with a dealId that
   * didn't come from a DealService lookup already scoped to `companyId`.
   */
  async logDealEvent(
    companyId: string,
    createdById: string,
    input: DealActivityEventInput,
  ): Promise<ActivityEntity> {
    return this.activityRepository.createDealEvent(
      companyId,
      createdById,
      input,
    );
  }

  async findAll(
    companyId: string,
    query: ActivityQueryDto,
  ): Promise<ActivityRepositoryResult> {
    return this.activityRepository.findAll(companyId, query);
  }

  async findById(
    companyId: string,
    activityId: string,
  ): Promise<ActivityEntity> {
    const activity = await this.activityRepository.findById(
      companyId,
      activityId,
    );

    if (!activity) {
      throw new NotFoundException(
        `Activity with ID "${activityId}" not found.`,
      );
    }

    return activity;
  }

  async update(
    companyId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ): Promise<ActivityEntity> {
    const existingActivity = await this.activityRepository.findById(
      companyId,
      activityId,
    );

    if (!existingActivity) {
      throw new NotFoundException(
        `Activity with ID "${activityId}" not found.`,
      );
    }

    if (dto.contactId) {
      await this.assertContactInCompany(dto.contactId, companyId);
    }

    const updatedActivity = await this.activityRepository.update(
      companyId,
      activityId,
      dto,
    );

    if (!updatedActivity) {
      throw new NotFoundException(
        `Activity with ID "${activityId}" not found.`,
      );
    }

    return updatedActivity;
  }

  async remove(companyId: string, activityId: string): Promise<void> {
    const deleted = await this.activityRepository.softDelete(
      companyId,
      activityId,
    );

    if (!deleted) {
      throw new NotFoundException(
        `Activity with ID "${activityId}" not found.`,
      );
    }
  }
}