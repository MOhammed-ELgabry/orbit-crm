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

import { TASK_REPOSITORY } from './constants/task.constants';
import { TaskController } from './task.controller';
import { TaskRepository } from './repository/task.repository';
import { TaskService } from './task.service';

@Module({
  // ContactModule/LeadModule/DealModule are imported (not just
  // UserModule) so TaskService can inject ContactService/LeadService/
  // DealService to validate that a client-supplied contactId/leadId/
  // dealId belongs to the caller's own company — the same
  // tenant-scoping guarantee UserService already gives assignedToId,
  // mirroring exactly how DealModule imports ContactModule/LeadModule
  // for the same reason. ActivityModule is imported so TaskService can
  // log task lifecycle events via ActivityService.logTaskEvent (see
  // task.service.ts) — this is a one-way dependency (ActivityModule
  // and DealModule do not import TaskModule back), so there is no
  // circular module dependency.
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    ContactModule,
    LeadModule,
    DealModule,
    ActivityModule,
  ],

  controllers: [TaskController],

  providers: [
    TaskService,

    {
      provide: TASK_REPOSITORY,
      useClass: TaskRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],

  exports: [TaskService],
})
export class TaskModule {}
