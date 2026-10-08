import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MailModule } from '../mail/mail.module';

import { NOTIFICATION_REPOSITORY } from './constants/notification.constants';
import { NotificationController } from './notification.controller';
import {
  NOTIFICATION_WORKER_KICK,
  NotificationService,
} from './notification.service';
import { NotificationWorker } from './notification.worker';
import { NotificationRepository } from './repository/notification.repository';
import { WebPushService } from './web-push.service';

@Module({
  // AuthModule supplies the JwtService JwtAuthGuard needs; MailModule
  // supplies the existing MailService used for email delivery. This
  // module imports no domain module (Task/Deal/Lead/Calendar import IT,
  // never the reverse), so there is no circular module dependency.
  imports: [PrismaModule, AuthModule, MailModule],

  controllers: [NotificationController],

  providers: [
    NotificationService,
    NotificationWorker,
    WebPushService,

    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: NotificationRepository,
    },

    // Lets the service nudge the worker (deliver within ms instead of at
    // the next poll) without a hard constructor dependency on it.
    {
      provide: NOTIFICATION_WORKER_KICK,
      useExisting: NotificationWorker,
    },

    JwtAuthGuard,
  ],

  exports: [NotificationService],
})
export class NotificationModule {}
