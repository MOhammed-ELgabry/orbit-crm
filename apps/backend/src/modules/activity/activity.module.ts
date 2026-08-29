import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactModule } from '../contact/contact.module';

import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ACTIVITY_REPOSITORY } from './constants/activity.constants';
import { ActivityRepository } from './repository/activity.repository';

@Module({
  imports: [PrismaModule, AuthModule, ContactModule],

  controllers: [ActivityController],

  providers: [
    ActivityService,

    {
      provide: ACTIVITY_REPOSITORY,
      useClass: ActivityRepository,
    },

    JwtAuthGuard,
  ],

  exports: [ActivityService],
})
export class ActivityModule {}
