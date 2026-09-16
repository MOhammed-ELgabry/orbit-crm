import { LeadEntity } from '../entities/lead.entity';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { LeadQueryDto } from '../dto/lead-query.dto';

export interface LeadRepositoryResult {
  data: LeadEntity[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ILeadRepository {
  create(
    companyId: string,
    createdById: string,
    dto: CreateLeadDto,
  ): Promise<LeadEntity>;

  findAll(companyId: string, query: LeadQueryDto): Promise<LeadRepositoryResult>;

  findById(companyId: string, leadId: string): Promise<LeadEntity | null>;

  update(
    companyId: string,
    leadId: string,
    dto: UpdateLeadDto,
  ): Promise<LeadEntity | null>;

  softDelete(companyId: string, leadId: string): Promise<boolean>;
}