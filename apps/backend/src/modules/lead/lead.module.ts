import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserModule } from '../user/user.module';
import { PermissionsGuard } from '../../common/security/permissions.guard';

import { LEAD_REPOSITORY } from './constants/lead.constants';
import { LeadController } from './lead.controller';
import { LeadRepository } from './repository/lead.repository';
import { LeadService } from './lead.service';

@Module({
  imports: [PrismaModule, AuthModule, UserModule],

  controllers: [LeadController],

  providers: [
    LeadService,

    {
      provide: LEAD_REPOSITORY,
      useClass: LeadRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],

  exports: [LeadService],
})
export class LeadModule {}