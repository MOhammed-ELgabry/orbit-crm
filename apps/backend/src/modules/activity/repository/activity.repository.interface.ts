import { ActivityEntity } from '../entities/activity.entity';
import { CreateActivityDto } from '../dto/create-activity.dto';
import { UpdateActivityDto } from '../dto/update-activity.dto';
import { ActivityQueryDto } from '../dto/activity-query.dto';

export interface ActivityRepositoryResult {
  data: ActivityEntity[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface IActivityRepository {
  create(
    companyId: string,
    createdById: string,
    dto: CreateActivityDto,
  ): Promise<ActivityEntity>;

  findAll(
    companyId: string,
    query: ActivityQueryDto,
  ): Promise<ActivityRepositoryResult>;

  findById(
    companyId: string,
    activityId: string,
  ): Promise<ActivityEntity | null>;

  update(
    companyId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ): Promise<ActivityEntity | null>;

  softDelete(companyId: string, activityId: string): Promise<boolean>;
}
