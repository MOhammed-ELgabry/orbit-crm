import type { ChatConversationKind } from './chat.constants';

/** The verified, CURRENT server-side identity of a chat caller. */
export interface ChatActor {
  userId: string;
  companyId: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  roleName: string | null;
}

export interface ChatReceipt {
  readCount: number;
  recipientCount: number;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  sequence: number;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  /** Current role name of the sender (null if none / not resolvable). */
  senderRole: string | null;
  clientMessageId: string;
  body: string;
  createdAt: string;
  /** Present for the caller's own messages only. */
  receipt: ChatReceipt | null;
}

export interface ChatPeerDto {
  id: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
  /** Currently eligible to chat in the caller's company. */
  eligible: boolean;
}

export interface PresenceDto {
  online: boolean;
  lastSeenAt: string | null;
}

export interface ChatConversationDto {
  id: string;
  type: ChatConversationKind;
  lastSequence: number;
  unreadCount: number;
  lastMessage: ChatMessageDto | null;
  /** Direct only. */
  peer: (ChatPeerDto & PresenceDto) | null;
  /** Direct only: highest sequence the peer has read. */
  peerReadSequence: number | null;
  /** The caller's own read cursor. */
  readSequence: number;
  /** false when the peer is no longer eligible (history stays readable). */
  canSend: boolean;
  updatedAt: string;
}

export interface ChatTeammateDto extends PresenceDto {
  id: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
}

export interface ChatMeDto {
  id: string;
  companyId: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
}

// ---------------------------------------------------------------------
// Real-time events (server -> client). Clients never choose rooms: what a
// connection receives is decided on the server from its verified identity.
// ---------------------------------------------------------------------

export type ChatServerEvent =
  | {
      type: 'ready';
      connectionId: string;
      serverTime: string;
      heartbeatMs: number;
      tokenExpiresAt: string;
    }
  | { type: 'pong'; serverTime: string }
  | {
      type: 'message.new';
      conversationId: string;
      conversationType: ChatConversationKind;
      message: ChatMessageDto;
    }
  | {
      type: 'read.updated';
      conversationId: string;
      conversationType: ChatConversationKind;
      readerId: string;
      upToSequence: number;
    }
  | {
      type: 'presence.update';
      userId: string;
      online: boolean;
      lastSeenAt: string | null;
    }
  | { type: 'error'; code: string };

export interface PublishTarget {
  companyId: string;
  /** Explicit recipients. Omit for "everyone eligible in the company". */
  userIds?: readonly string[];
}
