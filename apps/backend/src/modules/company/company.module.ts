import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompanyRepository } from './repository/company.repository';
import { COMPANY_REPOSITORY } from './constants/company.constants';

@Module({
  controllers: [CompanyController],
  providers: [
    CompanyService,
    {
      provide: COMPANY_REPOSITORY,
      useClass: CompanyRepository,
    },
  ],
})
export class CompanyModule {}