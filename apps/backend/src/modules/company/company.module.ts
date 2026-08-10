import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompanyRepository } from './repository/company.repository';
import { COMPANY_REPOSITORY } from './constants/company.constants';

@Module({
  imports: [AuthModule],

  controllers: [CompanyController],

  providers: [
    CompanyService,

    {
      provide: COMPANY_REPOSITORY,
      useClass: CompanyRepository,
    },

    JwtAuthGuard,
  ],
})
export class CompanyModule {}