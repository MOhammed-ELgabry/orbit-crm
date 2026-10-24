import type { AuditActor } from '../../audit/audit.types';
import { DealEntity } from '../entities/deal.entity';
import { CreateDealDto } from '../dto/create-deal.dto';
import { UpdateDealDto } from '../dto/update-deal.dto';
import { DealQueryDto } from '../dto/deal-query.dto';

export interface DealRepositoryResult {
  data: DealEntity[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface IDealRepository {
  create(
    companyId: string,
    createdById: string,
    dto: CreateDealDto,
    audit: AuditActor,
  ): Promise<DealEntity>;

  findAll(
    companyId: string,
    query: DealQueryDto,
  ): Promise<DealRepositoryResult>;

  findById(companyId: string, dealId: string): Promise<DealEntity | null>;

  update(
    companyId: string,
    dealId: string,
    dto: UpdateDealDto,
    audit: AuditActor,
  ): Promise<DealEntity | null>;

  softDelete(
    companyId: string,
    dealId: string,
    audit: AuditActor,
  ): Promise<boolean>;
}
