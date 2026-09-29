import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserModule } from '../user/user.module';
import { ContactModule } from '../contact/contact.module';
import { LeadModule } from '../lead/lead.module';
import { DealModule } from '../deal/deal.module';
import { ActivityModule } from '../activity/activity.module';
import { PermissionsGuard } from '../../common/security/permissions.guard';

import { CALENDAR_REPOSITORY } from './constants/calendar.constants';
import { CalendarEventRepository } from './repository/calendar-event.repository';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';

@Module({
  // ContactModule/LeadModule/DealModule are imported (not just
  // UserModule) so CalendarService can inject ContactService/
  // LeadService/DealService to validate that a client-supplied
  // contactId/leadId/dealId belongs to the caller's own company —
  // mirroring exactly how TaskModule/DealModule do the same for the
  // same reason. ActivityModule is imported so CalendarService can log
  // event lifecycle activity via ActivityService.logCalendarEvent —
  // this is a one-way dependency (ActivityModule does not import
  // CalendarModule back), so there is no circular module dependency.
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    ContactModule,
    LeadModule,
    DealModule,
    ActivityModule,
  ],

  controllers: [CalendarController],

  providers: [
    CalendarService,

    {
      provide: CALENDAR_REPOSITORY,
      useClass: CalendarEventRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],

  exports: [CalendarService],
})
export class CalendarModule {}