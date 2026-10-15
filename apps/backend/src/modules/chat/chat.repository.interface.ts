import type { ChatConversationKind } from './chat.constants';

/** Rows returned by the repository are plain data (numbers, not BigInt). */

export interface ChatUserRow {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  roleName: string | null;
}

export interface ChatActorRow extends ChatUserRow {
  companyId: string;
}

/** A user as seen from a given company (peer lookups). */
export interface ChatPeerRow extends ChatUserRow {
  /** Active, not deleted, in that company, company active. */
  eligible: boolean;
  /** The user row still exists (false after a hard delete). */
  exists: boolean;
}

export interface ChatConversationRow {
  id: string;
  companyId: string;
  type: ChatConversationKind;
  conversationKey: string;
  directUserLowKey: string | null;
  directUserHighKey: string | null;
  nextSequence: number;
  updatedAt: Date;
}

export interface ChatMessageRow {
  id: string;
  conversationId: string;
  sequence: number;
  senderKey: string;
  senderName: string;
  senderAvatar: string | null;
  clientMessageId: string;
  body: string;
  audienceEpoch: number | null;
  createdAt: Date;
}

export interface DirectConversationListRow {
  conversation: ChatConversationRow;
  peerKey: string;
  myReadSequence: number;
  peerReadSequence: number;
  unreadCount: number;
}

export interface TeamStateRow {
  conversation: ChatConversationRow;
  readSequence: number;
  unreadCount: number;
}

export interface InsertMessageInput {
  conversationId: string;
  companyId: string;
  type: ChatConversationKind;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  clientMessageId: string;
  body: string;
}

export interface InsertMessageResult {
  message: ChatMessageRow;
}

export interface ListMessagesInput {
  conversation: ChatConversationRow;
  /** Whose visibility rules apply (team history is audience-scoped). */
  viewerId: string;
  before?: number;
  after?: number;
  limit: number;
}

export interface MarkReadResult {
  /** Cursor after the call. */
  readSequence: number;
  /** Cursor before the call. */
  previousSequence: number;
  advanced: boolean;
}

export interface PresenceLeaseRow {
  companyId: string;
  userKey: string;
  lastHeartbeat: Date;
}

/**
 * Persistence boundary of the chat module. Every method that takes a
 * `companyId` filters on it: a caller can never reach another tenant's rows
 * by passing an id.
 */
export interface IChatRepository {
  // --- identity -------------------------------------------------------
  findActor(userId: string): Promise<ChatActorRow | null>;
  findEligibleUsers(
    companyId: string,
    options: { search?: string; limit: number },
  ): Promise<ChatUserRow[]>;
  findPeers(companyId: string, userIds: string[]): Promise<ChatPeerRow[]>;
  getRoleNames(userIds: string[]): Promise<Map<string, string | null>>;

  // --- conversations --------------------------------------------------
  ensureTeamConversation(companyId: string): Promise<ChatConversationRow>;
  findConversationById(id: string): Promise<ChatConversationRow | null>;
  findDirectConversation(
    companyId: string,
    lowKey: string,
    highKey: string,
  ): Promise<ChatConversationRow | null>;
  createDirectConversation(
    companyId: string,
    lowKey: string,
    highKey: string,
  ): Promise<ChatConversationRow>;
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
  listDirectConversations(
    userId: string,
    companyId: string,
  ): Promise<DirectConversationListRow[]>;
  getTeamState(companyId: string, userId: string): Promise<TeamStateRow>;
  getParticipantReadSequences(
    conversationId: string,
  ): Promise<Map<string, number>>;

  // --- messages -------------------------------------------------------
  findMessageByClientId(
    conversationId: string,
    senderKey: string,
    clientMessageId: string,
  ): Promise<ChatMessageRow | null>;
  insertMessage(input: InsertMessageInput): Promise<InsertMessageResult>;
  listMessages(input: ListMessagesInput): Promise<ChatMessageRow[]>;
  getLastMessages(
    conversationIds: string[],
  ): Promise<Map<string, ChatMessageRow>>;
  getLastVisibleTeamMessage(
    conversation: ChatConversationRow,
    viewerId: string,
  ): Promise<ChatMessageRow | null>;

  // --- audience / receipts --------------------------------------------
  /** user keys that were team members at `epoch` (immutable per epoch). */
  getAudienceMembers(companyId: string, epoch: number): Promise<string[]>;
  /** user keys that are team members right now (open intervals). */
  getCurrentMembers(companyId: string): Promise<string[]>;
  getTeamCursors(companyId: string): Promise<Map<string, number>>;

  // --- read state -----------------------------------------------------
  markDirectRead(
    conversation: ChatConversationRow,
    readerId: string,
    upToSequence: number,
  ): Promise<MarkReadResult>;
  markTeamRead(
    conversation: ChatConversationRow,
    readerId: string,
    upToSequence: number,
  ): Promise<MarkReadResult>;
  countDirectUnread(
    conversationId: string,
    userId: string,
    readSequence: number,
  ): Promise<number>;
}
