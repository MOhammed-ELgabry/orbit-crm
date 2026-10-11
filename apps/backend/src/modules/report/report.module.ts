import { Module } from '@nestjs/common';

import { PermissionsGuard } from '../../common/security/permissions.guard';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { REPORT_REPOSITORY } from './constants/report.constants';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ReportRepository } from './repository/report.repository';

@Module({
  // AuthModule supplies the JwtService JwtAuthGuard needs.
  imports: [PrismaModule, AuthModule],

  controllers: [ReportController],

  providers: [
    ReportService,

    {
      provide: REPORT_REPOSITORY,
      useClass: ReportRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class ReportModule {}
