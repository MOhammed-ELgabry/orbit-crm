import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/security/permissions.guard';

import { LEAD_CONVERSION_REPOSITORY } from './constants/lead-conversion.constants';
import { LeadConversionController } from './lead-conversion.controller';
import { LeadConversionService } from './lead-conversion.service';
import { LeadConversionRepository } from './repository/lead-conversion.repository';

/**
 * Standalone module (it imports no domain module): the conversion touches
 * Contact, Lead, Deal, Task, CalendarEvent and Activity inside ONE
 * transaction, so its repository talks to Prisma directly — exactly as
 * every other repository does for its own writes — instead of chaining
 * other modules' services, which each open their own transaction.
 */
@Module({
  imports: [PrismaModule, AuthModule],

  controllers: [LeadConversionController],

  providers: [
    LeadConversionService,

    {
      provide: LEAD_CONVERSION_REPOSITORY,
      useClass: LeadConversionRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],

  exports: [LeadConversionService],
})
export class LeadConversionModule {}
