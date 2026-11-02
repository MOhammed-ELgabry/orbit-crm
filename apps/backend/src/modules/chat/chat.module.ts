import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
import { ChatAttachmentUploadInterceptor } from './attachments/chat-attachment-upload.interceptor';
import {
  CHAT_ATTACHMENTS_ENV_NAMES,
  resolveChatAttachmentsConfig,
  type ChatAttachmentsConfig,
} from './attachments/chat-attachments.config';
import {
  CHAT_ATTACHMENTS_CONFIG,
  CHAT_ATTACHMENTS_REPOSITORY,
  CHAT_ATTACHMENTS_STORAGE,
} from './attachments/chat-attachments.constants';
import { ChatAttachmentsController } from './attachments/chat-attachments.controller';
import { ChatAttachmentsLinkService } from './attachments/chat-attachments-link.service';
import { CHAT_ATTACHMENTS_PORT } from './attachments/chat-attachments.port';
import { ChatAttachmentsRepository } from './attachments/chat-attachments.repository';
import { ChatAttachmentsService } from './attachments/chat-attachments.service';
import { ChatAttachmentsSweeper } from './attachments/chat-attachments.sweeper';
import { LocalDiskAttachmentStorage } from './attachments/local-disk-attachment.storage';

/**
 * Team chat. Imports no domain module and is imported by none; it reuses
 * AuthModule only for the existing JwtService/JwtAuthGuard (nothing in auth
 * is changed) and NotificationModule to create inbox notifications for new
 * messages (one direction only: NotificationModule never imports chat, so
 * there is no module cycle). No permission is added: see ChatController.
 *
 * Chat attachments (DIRECT conversations) live in ./attachments and are wired
 * here. The feature is OFF unless CHAT_ATTACHMENTS_ENABLED is exactly "true";
 * a wrong configuration also leaves it off (it never stops the application).
 * While it is off nothing touches the disk: the storage provider is null.
 * There is no company allow-list; when on, it is on for every company.
 */
@Module({
  imports: [PrismaModule, AuthModule, NotificationModule],

  controllers: [ChatController, ChatAttachmentsController],

  providers: [
    ChatService,
    ChatEligibilityService,
    ChatHub,
    ChatPresenceService,
    ChatRealtimeServer,

    { provide: CHAT_REPOSITORY, useClass: ChatRepository },

    JwtAuthGuard,

    // --- chat attachments ---------------------------------------------
    {
      provide: CHAT_ATTACHMENTS_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ChatAttachmentsConfig => {
        const env: Record<string, string | undefined> = {};

        for (const name of CHAT_ATTACHMENTS_ENV_NAMES) {
          env[name] = configService.get<string>(name);
        }

        const resolved = resolveChatAttachmentsConfig(env);

        if (!resolved.enabled && resolved.reason === 'invalid_config') {
          // Variable NAMES only, never values or paths.
          new Logger('ChatAttachments').warn(
            `Chat attachments are disabled: invalid configuration (${resolved.detail ?? 'unknown'})`,
          );
        }

        return resolved;
      },
    },
    {
      provide: CHAT_ATTACHMENTS_STORAGE,
      inject: [CHAT_ATTACHMENTS_CONFIG],
      // No instance (and so no folder, no write) while the feature is off.
      useFactory: (config: ChatAttachmentsConfig) =>
        config.enabled ? new LocalDiskAttachmentStorage(config.storageDir) : null,
    },
    { provide: CHAT_ATTACHMENTS_REPOSITORY, useClass: ChatAttachmentsRepository },
    ChatAttachmentsLinkService,
    { provide: CHAT_ATTACHMENTS_PORT, useExisting: ChatAttachmentsLinkService },
    ChatAttachmentsService,
    ChatAttachmentUploadInterceptor,
    ChatAttachmentsSweeper,
  ],

  exports: [ChatService],
})
export class ChatModule {}
