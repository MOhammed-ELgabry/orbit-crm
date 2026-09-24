import { TaskEntity } from '../entities/task.entity';
import { CreateTaskDto } from '../dto/create-task.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { TaskQueryDto } from '../dto/task-query.dto';

export interface TaskRepositoryResult {
  data: TaskEntity[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ITaskRepository {
  /**
   * `completedAt` is computed by TaskService from the *effective*
   * status (dto.status, defaulting to "todo" like the column itself
   * does) — never taken from the DTO directly, since neither
   * CreateTaskDto nor UpdateTaskDto exposes it as a field. See the
   * Task model comment in schema.prisma for why.
   */
  create(
    companyId: string,
    createdById: string,
    dto: CreateTaskDto,
    completedAt: Date | null,
  ): Promise<TaskEntity>;

  findAll(
    companyId: string,
    query: TaskQueryDto,
  ): Promise<TaskRepositoryResult>;

  findById(companyId: string, taskId: string): Promise<TaskEntity | null>;

  /**
   * `completedAt`: `undefined` means "status wasn't part of this
   * update, leave completedAt untouched"; `Date | null` means
   * "status was part of this update, this is its new derived value" —
   * see TaskService.update.
   */
  update(
    companyId: string,
    taskId: string,
    dto: UpdateTaskDto,
    completedAt: Date | null | undefined,
  ): Promise<TaskEntity | null>;

  softDelete(companyId: string, taskId: string): Promise<boolean>;
}
