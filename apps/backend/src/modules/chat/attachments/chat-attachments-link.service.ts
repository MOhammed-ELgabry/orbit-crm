import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { ChatConversationRow } from '../chat.repository.interface';
import type { ChatActor, ChatAttachmentDto } from '../chat.types';

import type { ChatAttachmentsPort } from './chat-attachments.port';
import {
  ATTACHMENT_ERRORS,
  CHAT_ATTACHMENTS_CONFIG,
  CHAT_ATTACHMENTS_REPOSITORY,
} from './chat-attachments.constants';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import type {
  AttachmentRow,
  IChatAttachmentsRepository,
} from './chat-attachments.repository';

export function toAttachmentDto(row: AttachmentRow): ChatAttachmentDto {
  return {
    id: row.id,
    kind: row.kind,
    contentType: row.contentType,
    displayName: row.displayName,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
  };
}

/**
 * The part of the feature ChatService talks to (see ChatAttachmentsPort).
 * It never authorises anything itself: ChatService has already resolved the
 * actor and the conversation through the existing chat authorization; this
 * class only checks that the ATTACHMENT fits the message being sent.
 */
@Injectable()
export class ChatAttachmentsLinkService implements ChatAttachmentsPort {
  constructor(
    @Inject(CHAT_ATTACHMENTS_CONFIG)
    private readonly config: ChatAttachmentsConfig,
    @Inject(CHAT_ATTACHMENTS_REPOSITORY)
    private readonly repository: IChatAttachmentsRepository,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async requireLinkable(
    actor: ChatActor,
    conversation: ChatConversationRow,
    attachmentId: string,
  ): Promise<ChatAttachmentDto> {
    if (!this.config.enabled) {
      throw new NotFoundException(ATTACHMENT_ERRORS.disabled);
    }

    if (conversation.type !== 'DIRECT') {
      throw new BadRequestException(ATTACHMENT_ERRORS.directOnly);
    }

    const row = await this.repository.findInConversation(
      attachmentId,
      conversation.id,
      actor.companyId,
    );

    // Someone else's attachment, another conversation's, another company's
    // and a missing one are indistinguishable.
    if (!row || row.uploaderKey !== actor.userId) {
      throw new NotFoundException(ATTACHMENT_ERRORS.notFound);
    }

    if (row.status === 'ATTACHED') {
      throw new ConflictException(ATTACHMENT_ERRORS.alreadyUsed);
    }

    if (row.status === 'UPLOADING') {
      throw new ConflictException(ATTACHMENT_ERRORS.notReady);
    }

    if (
      row.status === 'EXPIRED' ||
      !row.expiresAt ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      throw new GoneException(ATTACHMENT_ERRORS.expired);
    }

    return toAttachmentDto(row);
  }

  async describeForMessages(
    companyId: string,
    messageIds: string[],
  ): Promise<Map<string, ChatAttachmentDto>> {
    const result = new Map<string, ChatAttachmentDto>();

    if (!this.config.enabled || messageIds.length === 0) return result;

    const rows = await this.repository.findByMessageIds(companyId, messageIds);

    for (const row of rows) {
      if (row.messageId) result.set(row.messageId, toAttachmentDto(row));
    }

    return result;
  }
}
