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

/**
 * Shape for a Deal-originated system activity — deliberately not
 * CreateActivityDto: dealId here is trusted (the only caller,
 * DealService, has already confirmed it belongs to the company), while
 * CreateActivityDto's fields are all still validated from an untrusted
 * HTTP body. See ActivityService.logDealEvent.
 */
export interface DealActivityEventInput {
  type: string;
  title: string;
  description?: string;
  dealId: string;
}

/**
 * Same trust shape as DealActivityEventInput, for a Task-originated
 * system activity — taskId here is trusted (the only caller,
 * TaskService, has already confirmed it belongs to the company). See
 * ActivityService.logTaskEvent.
 */
export interface TaskActivityEventInput {
  type: string;
  title: string;
  description?: string;
  taskId: string;
}

export interface IActivityRepository {
  create(
    companyId: string,
    createdById: string,
    dto: CreateActivityDto,
  ): Promise<ActivityEntity>;

  createDealEvent(
    companyId: string,
    createdById: string,
    input: DealActivityEventInput,
  ): Promise<ActivityEntity>;

  createTaskEvent(
    companyId: string,
    createdById: string,
    input: TaskActivityEventInput,
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
