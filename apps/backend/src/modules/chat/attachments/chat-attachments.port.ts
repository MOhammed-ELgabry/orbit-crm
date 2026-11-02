import type { ChatConversationRow } from '../chat.repository.interface';
import type { ChatActor, ChatAttachmentDto } from '../chat.types';

export const CHAT_ATTACHMENTS_PORT = Symbol('CHAT_ATTACHMENTS_PORT');

/**
 * What ChatService needs from the attachments feature, and nothing more.
 * ChatService depends on this interface only (and optionally: it works
 * unchanged when no implementation is provided), while the upload/download
 * side of the feature depends on ChatService.authorize - so the dependency
 * graph has no cycle and the existing authorization is reused, never copied.
 */
export interface ChatAttachmentsPort {
  /** The feature switch (CHAT_ATTACHMENTS_ENABLED) and a valid configuration. */
  readonly enabled: boolean;

  /**
   * Validates that `attachmentId` may be linked to a new message of `actor`
   * in `conversation` (READY, not expired, uploaded by the actor to THIS
   * conversation, DIRECT) and returns its public metadata. Throws an
   * HttpException otherwise. Does not change anything.
   */
  requireLinkable(
    actor: ChatActor,
    conversation: ChatConversationRow,
    attachmentId: string,
  ): Promise<ChatAttachmentDto>;

  /**
   * Public metadata of the attachments linked to the given messages of the
   * given company, keyed by message id. Returns an empty map when the
   * feature is off (no database access at all).
   */
  describeForMessages(
    companyId: string,
    messageIds: string[],
  ): Promise<Map<string, ChatAttachmentDto>>;
}
