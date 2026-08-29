import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ContactService } from '../contact/contact.service';

import { ACTIVITY_REPOSITORY } from './constants/activity.constants';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityEntity } from './entities/activity.entity';
import type {
  ActivityRepositoryResult,
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
