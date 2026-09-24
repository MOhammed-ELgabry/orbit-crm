import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserModule } from '../user/user.module';
import { ContactModule } from '../contact/contact.module';
import { LeadModule } from '../lead/lead.module';
import { ActivityModule } from '../activity/activity.module';
import { PermissionsGuard } from '../../common/security/permissions.guard';

import { DEAL_REPOSITORY } from './constants/deal.constants';
import { DealController } from './deal.controller';
import { DealRepository } from './repository/deal.repository';
import { DealService } from './deal.service';

@Module({
  // ContactModule/LeadModule are imported (not just UserModule) so
  // DealService can inject ContactService/LeadService to validate that
  // a client-supplied contactId/leadId belongs to the caller's own
  // company — the same tenant-scoping guarantee UserService already
  // gives assignedToId for Contact/Lead. ActivityModule is imported so
  // DealService can log deal lifecycle events via
  // ActivityService.logDealEvent (see deal.service.ts) — this is a
  // one-way dependency (ActivityModule does not import DealModule back),
  // so there is no circular module dependency.
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    ContactModule,
    LeadModule,
    ActivityModule,
  ],

  controllers: [DealController],

  providers: [
    DealService,

    {
      provide: DEAL_REPOSITORY,
      useClass: DealRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],

  exports: [DealService],
})
export class DealModule {}
