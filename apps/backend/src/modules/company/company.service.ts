import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PaginationResult } from '../../common/interfaces/pagination-result.interface';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { COMPANY_REPOSITORY } from './constants/company.constants';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyEntity } from './entities/company.entity';
import type { ICompanyRepository } from './repository/company.repository.interface';

@Injectable()
export class CompanyService {
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<CompanyEntity> {
    return this.companyRepository.create(createCompanyDto);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginationResult<CompanyEntity>> {
    return this.companyRepository.findAll(query);
  }

  async findById(id: string): Promise<CompanyEntity> {
    const company = await this.companyRepository.findById(id);

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async update(
    id: string,
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<CompanyEntity> {
    const company = await this.companyRepository.findById(id);

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.companyRepository.update(id, updateCompanyDto);
  }

  async delete(id: string): Promise<void> {
    const company = await this.companyRepository.findById(id);

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    await this.companyRepository.delete(id);
  }
}
