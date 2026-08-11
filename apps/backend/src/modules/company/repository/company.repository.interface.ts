import { PaginationResult } from '../../../common/interfaces/pagination-result.interface';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

import { CreateCompanyDto } from '../dto/create-company.dto';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { CompanyEntity } from '../entities/company.entity';

export interface ICompanyRepository {
  create(data: CreateCompanyDto): Promise<CompanyEntity>;

  findAll(
    query: PaginationQueryDto,
    companyId: string,
  ): Promise<PaginationResult<CompanyEntity>>;

  findById(id: string): Promise<CompanyEntity | null>;

  update(id: string, data: UpdateCompanyDto): Promise<CompanyEntity>;

  delete(id: string): Promise<void>;
}
