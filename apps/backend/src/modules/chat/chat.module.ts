import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationModule } from '../notification/notification.module';

import { CHAT_REPOSITORY } from './chat.constants';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { ChatEligibilityService } from './chat-eligibility.service';
import { ChatHub } from './chat-hub.service';
import { ChatPresenceService } from './chat-presence.service';
import { ChatRealtimeServer } from './realtime/chat-realtime.server';

/**
 * Team chat. Imports no domain module and is imported by none; it reuses
 * AuthModule only for the existing JwtService/JwtAuthGuard (nothing in auth
 * is changed) and NotificationModule to create inbox notifications for new
 * messages (one direction only: NotificationModule never imports chat, so
 * there is no module cycle). No permission is added: see ChatController.
 */
@Module({
  imports: [PrismaModule, AuthModule, NotificationModule],

  controllers: [ChatController],

  providers: [
    ChatService,
    ChatEligibilityService,
    ChatHub,
    ChatPresenceService,
    ChatRealtimeServer,

    { provide: CHAT_REPOSITORY, useClass: ChatRepository },

    JwtAuthGuard,
  ],

  exports: [ChatService],
})
export class ChatModule {}
