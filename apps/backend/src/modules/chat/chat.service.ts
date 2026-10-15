import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  CHAT_REPOSITORY,
  SEND_MAX_ATTEMPTS,
  TEAMMATES_MAX,
} from './chat.constants';
import type {
  ChatConversationRow,
  ChatMessageRow,
  ChatPeerRow,
  IChatRepository,
} from './chat.repository.interface';
import { orderPair } from './chat.repository';
import type {
  ChatActor,
  ChatConversationDto,
  ChatMeDto,
  ChatMessageDto,
  ChatReceipt,
  ChatTeammateDto,
} from './chat.types';
import {
  errorName,
  fullName,
  isRetryableTransactionError,
  isUniqueViolation,
  sleep,
} from './chat.utils';
import { NotificationService } from '../notification/notification.service';
import { ChatEligibilityService } from './chat-eligibility.service';
import { ChatHub } from './chat-hub.service';
import { ChatPresenceService } from './chat-presence.service';
import type { MessagesQueryDto } from './dto/messages-query.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { TeammatesQueryDto } from './dto/teammates-query.dto';

const AUDIENCE_CACHE_MAX = 500;

interface ReceiptContext {
  /** DIRECT: highest sequence the peer has read. */
  peerReadSequence?: number;
  /** TEAM: reader cursors of the company. */
  cursors?: Map<string, number>;
  /** TEAM: user keys that are members right now. */
  currentMembers?: Set<string>;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  /**
   * Team membership AT a given epoch never changes after that epoch is
   * current (intervals are only ever closed at a LATER epoch), so it is safe
   * to cache by (company, epoch).
   */
  private readonly audienceCache = new Map<string, Set<string>>();

  /**
   * In-flight notification work. Saving a message never waits for it (see
   * notifyMessage); tests and graceful shutdown can await it through
   * flushNotifications().
   */
  private readonly pendingNotifications = new Set<Promise<void>>();

  constructor(
    @Inject(CHAT_REPOSITORY) private readonly repository: IChatRepository,
    private readonly eligibility: ChatEligibilityService,
    private readonly hub: ChatHub,
    private readonly presence: ChatPresenceService,
    private readonly notifications: NotificationService,
  ) {}

  /** Resolves when every notification started so far has finished (or failed). */
  async flushNotifications(): Promise<void> {
    while (this.pendingNotifications.size > 0) {
      await Promise.allSettled(Array.from(this.pendingNotifications));
    }
  }

  private trackNotification(work: Promise<void>): void {
    this.pendingNotifications.add(work);
    void work.finally(() => this.pendingNotifications.delete(work));
  }

  // ---------------------------------------------------------------------
  // Bootstrap / lists
  // ---------------------------------------------------------------------

  async getBootstrap(userId: string) {
    const actor = await this.eligibility.requireActor(userId);

    const [conversations, teammates] = await Promise.all([
      this.buildConversationList(actor),
      this.buildTeammates(actor, {}),
    ]);

    return {
      me: this.toMe(actor),
      conversations,
      teammates,
      totalUnread: conversations.reduce((sum, c) => sum + c.unreadCount, 0),
      serverTime: new Date().toISOString(),
    };
  }

  async listConversations(userId: string) {
    const actor = await this.eligibility.requireActor(userId);
    return this.buildConversationList(actor);
  }

  async listTeammates(userId: string, query: TeammatesQueryDto) {
    const actor = await this.eligibility.requireActor(userId);
    return this.buildTeammates(actor, query);
  }

  /** Cheap authenticated probe used by the client to (re)validate its session. */
  async getSession(userId: string) {
    const actor = await this.eligibility.requireActor(userId);
    return { me: this.toMe(actor), serverTime: new Date().toISOString() };
  }

  // ---------------------------------------------------------------------
  // Direct conversations
  // ---------------------------------------------------------------------

  async openDirectConversation(
    userId: string,
    peerId: string,
  ): Promise<ChatConversationDto> {
    const actor = await this.eligibility.requireActor(userId);

    if (peerId === actor.userId) {
      throw new BadRequestException(
        'You cannot start a conversation with yourself.',
      );
    }

    const [peer] = await this.repository.findPeers(actor.companyId, [peerId]);

    // Another company's user, a deactivated/deleted user and an unknown id
    // are indistinguishable on purpose: no enumeration of other tenants.
    if (!peer || !peer.eligible) {
      throw new NotFoundException('Teammate not found.');
    }

    const [low, high] = orderPair(actor.userId, peerId);

    const conversation =
      (await this.repository.findDirectConversation(
        actor.companyId,
        low,
        high,
      )) ??
      (await this.repository.createDirectConversation(
        actor.companyId,
        low,
        high,
      ));

    const list = await this.buildConversationList(actor, {
      includeConversationIds: [conversation.id],
    });
    const item = list.find((c) => c.id === conversation.id);

    if (!item) {
      throw new NotFoundException('Conversation not found.');
    }

    return item;
  }

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------

  async getMessages(
    userId: string,
    conversationId: string,
    query: MessagesQueryDto,
  ) {
    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.authorize(actor, conversationId);

    if (query.before !== undefined && query.after !== undefined) {
      throw new BadRequestException(
        'Use either `before` or `after`, not both.',
      );
    }

    const rows = await this.repository.listMessages({
      conversation,
      viewerId: actor.userId,
      before: query.before,
      after: query.after,
      limit: query.limit + 1,
    });

    let hasMore = false;
    let page = rows;

    if (rows.length > query.limit) {
      hasMore = true;
      // Ascending order: the extra row is the OLDEST one for `before` pages
      // (the cursor side) and the NEWEST for `after` pages.
      page = query.after !== undefined ? rows.slice(0, -1) : rows.slice(1);
    }

    const messages = await this.toMessageDtos(actor, conversation, page);
    const meta = await this.conversationMeta(actor, conversation);

    return { messages, hasMore, ...meta };
  }

  async getReceipts(
    userId: string,
    conversationId: string,
    from: number,
    to: number,
  ) {
    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.authorize(actor, conversationId);

    if (to < from || to - from > 500) {
      throw new BadRequestException('Invalid sequence range.');
    }

    const rows = await this.repository.listMessages({
      conversation,
      viewerId: actor.userId,
      after: from - 1,
      limit: 200,
    });

    const own = rows.filter(
      (row) => row.senderKey === actor.userId && row.sequence <= to,
    );

    const messages = await this.toMessageDtos(actor, conversation, own);

    return {
      receipts: messages.map((m) => ({
        id: m.id,
        sequence: m.sequence,
        readCount: m.receipt?.readCount ?? 0,
        recipientCount: m.receipt?.recipientCount ?? 0,
      })),
    };
  }

  // ---------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<{ message: ChatMessageDto; duplicate: boolean }> {
    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.authorize(actor, conversationId);

    if (conversation.type === 'DIRECT') {
      const peerId = this.peerKeyOf(conversation, actor.userId);
      const [peer] = await this.repository.findPeers(actor.companyId, [peerId]);

      if (!peer || !peer.eligible) {
        throw new ForbiddenException(
          'This person is no longer available in the workspace.',
        );
      }
    }

    // Idempotency, fast path: a retry of an already persisted message gets
    // the original back and publishes nothing.
    const existing = await this.repository.findMessageByClientId(
      conversation.id,
      actor.userId,
      dto.clientMessageId,
    );

    if (existing) {
      return this.duplicateResult(actor, conversation, existing, dto.body);
    }

    let row: ChatMessageRow | undefined;

    for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.repository.insertMessage({
          conversationId: conversation.id,
          companyId: actor.companyId,
          type: conversation.type,
          senderId: actor.userId,
          senderName: fullName(actor.firstName, actor.lastName),
          senderAvatar: actor.avatar,
          clientMessageId: dto.clientMessageId,
          body: dto.body,
        });

        row = result.message;
        break;
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Two requests with the same clientMessageId raced: one won.
          const winner = await this.repository.findMessageByClientId(
            conversation.id,
            actor.userId,
            dto.clientMessageId,
          );

          if (winner) {
            return this.duplicateResult(actor, conversation, winner, dto.body);
          }
        }

        if (isRetryableTransactionError(error) && attempt < SEND_MAX_ATTEMPTS) {
          await sleep(15 * attempt + Math.floor(Math.random() * 25));
          continue;
        }

        throw this.mapPersistenceError(error);
      }
    }

    if (!row) {
      throw new ConflictException(
        'The message could not be sent right now. Please retry.',
      );
    }

    // The row is already committed: building the response must not be able
    // to turn a durable message into a failed request. If the receipt lookup
    // hiccups, answer with the persisted message and a zero receipt (one
    // check); the next history fetch recomputes it.
    let message: ChatMessageDto;
    try {
      message = (await this.toMessageDtos(actor, conversation, [row]))[0];
    } catch (error) {
      this.logger.warn(
        `Receipt lookup failed after a send (${errorName(error)})`,
      );
      message = this.toMessageDto(actor, row, new Map(), {
        readCount: 0,
        recipientCount: 0,
      });
    }

    // Only AFTER the transaction committed: nothing is ever published for a
    // message that is not durably stored.
    const audience = await this.publishMessage(
      actor,
      conversation,
      message,
      row,
    );

    // The inbox notification is created only now too, and independently:
    // the request does not wait for it and its failure changes nothing
    // about the (already durable, already published) message.
    this.trackNotification(
      this.notifyMessage(actor, conversation, row, audience),
    );

    return { message, duplicate: false };
  }

  // ---------------------------------------------------------------------
  // Read state
  // ---------------------------------------------------------------------

  async markRead(userId: string, conversationId: string, upToSequence: number) {
    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.authorize(actor, conversationId);

    if (conversation.type === 'DIRECT') {
      const result = await this.repository.markDirectRead(
        conversation,
        actor.userId,
        upToSequence,
      );

      if (result.advanced) {
        const peerId = this.peerKeyOf(conversation, actor.userId);

        this.hub.publish(
          { companyId: actor.companyId, userIds: [actor.userId, peerId] },
          {
            type: 'read.updated',
            conversationId: conversation.id,
            conversationType: 'DIRECT',
            readerId: actor.userId,
            upToSequence: result.readSequence,
          },
        );
      }

      await this.syncNotificationRead(actor, conversation, result.readSequence);

      const unreadCount = await this.repository.countDirectUnread(
        conversation.id,
        actor.userId,
        result.readSequence,
      );

      return {
        conversationId: conversation.id,
        readSequence: result.readSequence,
        unreadCount,
      };
    }

    const result = await this.repository.markTeamRead(
      conversation,
      actor.userId,
      upToSequence,
    );

    if (result.advanced) {
      const members = await this.repository.getCurrentMembers(actor.companyId);

      this.hub.publish(
        { companyId: actor.companyId, userIds: members },
        {
          type: 'read.updated',
          conversationId: conversation.id,
          conversationType: 'TEAM',
          readerId: actor.userId,
          upToSequence: result.readSequence,
        },
      );
    }

    await this.syncNotificationRead(actor, conversation, result.readSequence);

    const state = await this.repository.getTeamState(
      actor.companyId,
      actor.userId,
    );

    return {
      conversationId: conversation.id,
      readSequence: result.readSequence,
      unreadCount: state.unreadCount,
    };
  }

  // ---------------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------------

  /**
   * Resolves a client-supplied conversation id into a conversation the caller
   * may access. The id is NOT proof of anything: the conversation must belong
   * to the caller's CURRENT company and, if direct, the caller must be one of
   * its two participants. Every failure is the same 404, so ids of other
   * tenants'/other people's conversations cannot be probed.
   */
  async authorize(
    actor: ChatActor,
    conversationId: string,
  ): Promise<ChatConversationRow> {
    const conversation =
      await this.repository.findConversationById(conversationId);

    if (!conversation || conversation.companyId !== actor.companyId) {
      throw new NotFoundException('Conversation not found.');
    }

    if (conversation.type === 'DIRECT') {
      const isPair =
        conversation.directUserLowKey === actor.userId ||
        conversation.directUserHighKey === actor.userId;

      if (
        !isPair ||
        !(await this.repository.isParticipant(conversation.id, actor.userId))
      ) {
        throw new NotFoundException('Conversation not found.');
      }
    }

    return conversation;
  }

  // ---------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------

  /**
   * Everyone who may see THIS message right now (sender included): DIRECT =
   * the two participants; TEAM = the message's historical audience
   * (audienceEpoch / TeamMembershipInterval) narrowed to people who are
   * still members - someone removed a moment ago must not be handed a live
   * copy or a notification even though the revalidation tick has not closed
   * their socket yet. Derived on the server only.
   */
  private async resolveAudience(
    actor: ChatActor,
    conversation: ChatConversationRow,
    row: ChatMessageRow,
  ): Promise<string[]> {
    if (conversation.type === 'TEAM') {
      const audience = await this.audienceAt(
        actor.companyId,
        row.audienceEpoch ?? 0,
      );
      const current = new Set(
        await this.repository.getCurrentMembers(actor.companyId),
      );
      return [...audience].filter((id) => current.has(id));
    }

    return [actor.userId, this.peerKeyOf(conversation, actor.userId)];
  }

  /** Returns the audience it published to, or null if that failed. */
  private async publishMessage(
    actor: ChatActor,
    conversation: ChatConversationRow,
    message: ChatMessageDto,
    row: ChatMessageRow,
  ): Promise<string[] | null> {
    try {
      const userIds = await this.resolveAudience(actor, conversation, row);

      this.hub.publish(
        { companyId: actor.companyId, userIds },
        {
          type: 'message.new',
          conversationId: conversation.id,
          conversationType: conversation.type,
          message,
        },
      );

      return userIds;
    } catch (error) {
      // The message is already durable; clients recover through history.
      this.logger.error(`Failed to publish a message (${errorName(error)})`);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Notifications (Notification module integration)
  //
  // Guarantees and limits - read before changing:
  //  * Runs only AFTER the message transaction committed, and never inside
  //    it: the sequence allocation holds a row lock on the conversation
  //    until commit, so doing notification work there would serialise every
  //    send in the conversation.
  //  * Never throws and never affects the send: the message is saved and
  //    published first; this is best effort on top of that.
  //  * NOT crash-proof: if the process dies between the commit and this
  //    call the inbox notification for that message is lost (the message,
  //    the chat unread counter and the live event are unaffected). A client
  //    retry with the same clientMessageId repairs it (duplicateResult).
  //    Closing the remaining gap needs a persisted marker or a sweeper,
  //    i.e. a migration, and was deliberately left out of this change.
  //  * Recipients are never taken from the client.
  // ---------------------------------------------------------------------

  private async notifyMessage(
    actor: ChatActor,
    conversation: ChatConversationRow,
    row: ChatMessageRow,
    knownAudience: string[] | null,
  ): Promise<void> {
    try {
      const audience =
        knownAudience ?? (await this.resolveAudience(actor, conversation, row));

      const recipientIds = audience.filter((id) => id !== actor.userId);
      if (recipientIds.length === 0) return;

      const { notifiedUserIds } = await this.notifications.publishChatMessage({
        companyId: actor.companyId,
        senderId: actor.userId,
        conversationId: conversation.id,
        conversationType: conversation.type,
        messageId: row.id,
        sequence: row.sequence,
        body: row.body,
        recipientIds,
      });

      await this.reconcileNotifiedReaders(
        actor.companyId,
        conversation,
        row.sequence,
        notifiedUserIds,
      );
    } catch (error) {
      // Name only: the error text could carry message content.
      this.logger.error(
        `Failed to notify about a message (${errorName(error)})`,
      );
    }
  }

  /**
   * A recipient may have read the message (read ack) before its inbox row
   * existed: that ack found nothing to mark. Re-check the cursor of every
   * recipient we just notified and mark their rows read when the cursor is
   * already past this message, so the two orders converge.
   */
  private async reconcileNotifiedReaders(
    companyId: string,
    conversation: ChatConversationRow,
    sequence: number,
    notifiedUserIds: string[],
  ): Promise<void> {
    if (notifiedUserIds.length === 0) return;

    const cursors =
      conversation.type === 'DIRECT'
        ? await this.repository.getParticipantReadSequences(conversation.id)
        : await this.repository.getTeamCursors(companyId);

    for (const userId of notifiedUserIds) {
      const readSequence = cursors.get(userId) ?? 0;

      if (readSequence >= sequence) {
        await this.notifications.markChatConversationRead(
          companyId,
          userId,
          conversation.id,
          readSequence,
        );
      }
    }
  }

  /**
   * Chat read -> notification read (the only direction): the caller's own
   * unread chat notifications of THIS conversation, up to the real cursor.
   * Runs after the caller was authorised for the conversation; a failure
   * here must never fail the read acknowledgement.
   */
  private async syncNotificationRead(
    actor: ChatActor,
    conversation: ChatConversationRow,
    readSequence: number,
  ): Promise<void> {
    try {
      await this.notifications.markChatConversationRead(
        actor.companyId,
        actor.userId,
        conversation.id,
        readSequence,
      );
    } catch (error) {
      this.logger.warn(
        `Could not sync notification read state (${errorName(error)})`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Builders
  // ---------------------------------------------------------------------

  private async duplicateResult(
    actor: ChatActor,
    conversation: ChatConversationRow,
    existing: ChatMessageRow,
    body: string,
  ) {
    if (existing.body !== body) {
      // Same idempotency key, different payload: a client bug or a replay
      // with a modified body. Never silently "succeed" with other content.
      throw new ConflictException(
        'This clientMessageId was already used for a different message.',
      );
    }

    // Recovery for a send whose notification step did not finish (a crash
    // or an error right after the commit) when the client retries with the
    // same clientMessageId. Idempotent by construction (DIRECT: unique
    // dedupe key; TEAM: the upsert only ever advances), so a retry of a
    // message that was already notified changes nothing.
    this.trackNotification(
      this.notifyMessage(actor, conversation, existing, null),
    );

    const message = (
      await this.toMessageDtos(actor, conversation, [existing])
    )[0];

    return { message, duplicate: true };
  }

  private mapPersistenceError(error: unknown): unknown {
    const text =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';

    if (
      /is not eligible|company is not eligible|outside the frozen audience/i.test(
        text,
      )
    ) {
      return new ForbiddenException('Chat is not available for this account.');
    }

    return error;
  }

  private async buildConversationList(
    actor: ChatActor,
    options: { includeConversationIds?: string[] } = {},
  ): Promise<ChatConversationDto[]> {
    const [team, directs] = await Promise.all([
      this.repository.getTeamState(actor.companyId, actor.userId),
      this.repository.listDirectConversations(actor.userId, actor.companyId),
    ]);

    // A freshly opened (still empty) direct conversation has no messages, so
    // the list query omits it; include it explicitly when asked.
    const extra = options.includeConversationIds ?? [];
    const missing = extra.filter(
      (id) => !directs.some((d) => d.conversation.id === id),
    );

    for (const id of missing) {
      const conversation = await this.repository.findConversationById(id);
      if (!conversation || conversation.type !== 'DIRECT') continue;

      const reads = await this.repository.getParticipantReadSequences(id);
      const peerKey = this.peerKeyOf(conversation, actor.userId);

      directs.push({
        conversation,
        peerKey,
        myReadSequence: reads.get(actor.userId) ?? 0,
        peerReadSequence: reads.get(peerKey) ?? 0,
        unreadCount: 0,
      });
    }

    const peerKeys = directs.map((d) => d.peerKey);
    const [peers, lastMessages, lastTeamMessage] = await Promise.all([
      this.repository.findPeers(actor.companyId, peerKeys),
      this.repository.getLastMessages(directs.map((d) => d.conversation.id)),
      this.repository.getLastVisibleTeamMessage(
        team.conversation,
        actor.userId,
      ),
    ]);

    const peerMap = new Map<string, ChatPeerRow>(peers.map((p) => [p.id, p]));
    const presence = await this.presence.getPresence(
      actor.companyId,
      peers.filter((p) => p.eligible).map((p) => p.id),
    );

    const roleNames = await this.repository.getRoleNames(
      [
        ...lastMessages.values(),
        ...(lastTeamMessage ? [lastTeamMessage] : []),
      ].map((m) => m.senderKey),
    );

    const toLast = (row: ChatMessageRow | null | undefined) =>
      row ? this.toMessageDto(actor, row, roleNames, null) : null;

    const result: ChatConversationDto[] = [
      {
        id: team.conversation.id,
        type: 'TEAM',
        lastSequence: team.conversation.nextSequence,
        unreadCount: team.unreadCount,
        lastMessage: toLast(lastTeamMessage),
        peer: null,
        peerReadSequence: null,
        readSequence: team.readSequence,
        canSend: true,
        updatedAt: team.conversation.updatedAt.toISOString(),
      },
    ];

    for (const direct of directs) {
      const peer = peerMap.get(direct.peerKey);
      const last = lastMessages.get(direct.conversation.id) ?? null;

      // A peer whose user row is gone keeps its identity through the
      // snapshots stored on their messages.
      const snapshotName =
        last && last.senderKey === direct.peerKey ? last.senderName : '';

      result.push({
        id: direct.conversation.id,
        type: 'DIRECT',
        lastSequence: direct.conversation.nextSequence,
        unreadCount: direct.unreadCount,
        lastMessage: toLast(last),
        peer: {
          id: direct.peerKey,
          name: peer ? fullName(peer.firstName, peer.lastName) : snapshotName,
          avatar: peer ? peer.avatar : null,
          roleName: peer ? peer.roleName : null,
          eligible: peer?.eligible ?? false,
          online: presence.get(direct.peerKey)?.online ?? false,
          lastSeenAt: presence.get(direct.peerKey)?.lastSeenAt ?? null,
        },
        peerReadSequence: direct.peerReadSequence,
        readSequence: direct.myReadSequence,
        canSend: peer?.eligible ?? false,
        updatedAt: direct.conversation.updatedAt.toISOString(),
      });
    }

    return result;
  }

  private async buildTeammates(
    actor: ChatActor,
    query: { search?: string },
  ): Promise<ChatTeammateDto[]> {
    const users = await this.repository.findEligibleUsers(actor.companyId, {
      search: query.search,
      limit: TEAMMATES_MAX,
    });

    const others = users.filter((u) => u.id !== actor.userId);
    const presence = await this.presence.getPresence(
      actor.companyId,
      others.map((u) => u.id),
    );

    return others.map((user) => ({
      id: user.id,
      name: fullName(user.firstName, user.lastName),
      avatar: user.avatar,
      roleName: user.roleName,
      online: presence.get(user.id)?.online ?? false,
      lastSeenAt: presence.get(user.id)?.lastSeenAt ?? null,
    }));
  }

  private async conversationMeta(
    actor: ChatActor,
    conversation: ChatConversationRow,
  ): Promise<{
    conversationId: string;
    lastSequence: number;
    peerReadSequence: number | null;
    readSequence: number;
  }> {
    if (conversation.type === 'DIRECT') {
      const reads = await this.repository.getParticipantReadSequences(
        conversation.id,
      );
      const peerKey = this.peerKeyOf(conversation, actor.userId);

      return {
        conversationId: conversation.id,
        lastSequence: conversation.nextSequence,
        peerReadSequence: reads.get(peerKey) ?? 0,
        readSequence: reads.get(actor.userId) ?? 0,
      };
    }

    const cursors = await this.repository.getTeamCursors(actor.companyId);

    return {
      conversationId: conversation.id,
      lastSequence: conversation.nextSequence,
      peerReadSequence: null,
      readSequence: cursors.get(actor.userId) ?? 0,
    };
  }

  /** Builds message DTOs including the caller's own receipts. */
  private async toMessageDtos(
    actor: ChatActor,
    conversation: ChatConversationRow,
    rows: ChatMessageRow[],
  ): Promise<ChatMessageDto[]> {
    if (rows.length === 0) return [];

    const roleNames = await this.repository.getRoleNames([
      ...new Set(rows.map((row) => row.senderKey)),
    ]);

    const ownRows = rows.filter((row) => row.senderKey === actor.userId);
    const context = await this.receiptContext(actor, conversation, ownRows);

    const audiences = new Map<number, Set<string>>();
    if (conversation.type === 'TEAM') {
      for (const row of ownRows) {
        const epoch = row.audienceEpoch ?? 0;
        if (!audiences.has(epoch)) {
          audiences.set(epoch, await this.audienceAt(actor.companyId, epoch));
        }
      }
    }

    return rows.map((row) => {
      let receipt: ChatReceipt | null = null;

      if (row.senderKey === actor.userId) {
        receipt = this.computeReceipt(
          conversation,
          row,
          context,
          audiences.get(row.audienceEpoch ?? 0),
        );
      }

      return this.toMessageDto(actor, row, roleNames, receipt);
    });
  }

  private toMessageDto(
    actor: ChatActor,
    row: ChatMessageRow,
    roleNames: Map<string, string | null>,
    receipt: ChatReceipt | null,
  ): ChatMessageDto {
    return {
      id: row.id,
      conversationId: row.conversationId,
      sequence: row.sequence,
      senderId: row.senderKey,
      senderName: row.senderName,
      senderAvatar: row.senderAvatar,
      senderRole:
        row.senderKey === actor.userId
          ? actor.roleName
          : (roleNames.get(row.senderKey) ?? null),
      clientMessageId: row.clientMessageId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      receipt,
    };
  }

  private async receiptContext(
    actor: ChatActor,
    conversation: ChatConversationRow,
    ownRows: ChatMessageRow[],
  ): Promise<ReceiptContext> {
    if (ownRows.length === 0) return {};

    if (conversation.type === 'DIRECT') {
      const reads = await this.repository.getParticipantReadSequences(
        conversation.id,
      );

      return {
        peerReadSequence: reads.get(this.peerKeyOf(conversation, actor.userId)),
      };
    }

    const [cursors, members] = await Promise.all([
      this.repository.getTeamCursors(actor.companyId),
      this.repository.getCurrentMembers(actor.companyId),
    ]);

    return { cursors, currentMembers: new Set(members) };
  }

  /**
   * "Read" = the recipient's client reported the message as VISIBLE (a
   * server-validated acknowledgement that only moves a cursor forward). It is
   * never inferred from socket delivery or presence.
   *
   * Team: recipients are the message's historical audience (who was a member
   * when it was sent), minus the sender, restricted to people who are STILL
   * members — so someone who left does not keep a message from ever counting
   * as read by everyone, and someone who joined later was never a recipient.
   */
  private computeReceipt(
    conversation: ChatConversationRow,
    row: ChatMessageRow,
    context: ReceiptContext,
    audience: Set<string> | undefined,
  ): ChatReceipt {
    if (conversation.type === 'DIRECT') {
      return {
        readCount: row.sequence <= (context.peerReadSequence ?? 0) ? 1 : 0,
        recipientCount: 1,
      };
    }

    let recipientCount = 0;
    let readCount = 0;

    for (const userKey of audience ?? []) {
      if (userKey === row.senderKey) continue;
      if (!context.currentMembers?.has(userKey)) continue;

      recipientCount += 1;
      if ((context.cursors?.get(userKey) ?? 0) >= row.sequence) readCount += 1;
    }

    return { readCount, recipientCount };
  }

  private async audienceAt(
    companyId: string,
    epoch: number,
  ): Promise<Set<string>> {
    const key = `${companyId}:${epoch}`;
    const cached = this.audienceCache.get(key);
    if (cached) return cached;

    const members = new Set(
      await this.repository.getAudienceMembers(companyId, epoch),
    );

    if (this.audienceCache.size >= AUDIENCE_CACHE_MAX) {
      // Map iterates in insertion order: the first key is the oldest entry.
      for (const oldest of this.audienceCache.keys()) {
        this.audienceCache.delete(oldest);
        break;
      }
    }

    this.audienceCache.set(key, members);
    return members;
  }

  private peerKeyOf(conversation: ChatConversationRow, userId: string): string {
    const low = conversation.directUserLowKey;
    const high = conversation.directUserHighKey;

    if (!low || !high || (userId !== low && userId !== high)) {
      throw new NotFoundException('Conversation not found.');
    }

    return userId === low ? high : low;
  }

  private toMe(actor: ChatActor): ChatMeDto {
    return {
      id: actor.userId,
      companyId: actor.companyId,
      name: fullName(actor.firstName, actor.lastName),
      avatar: actor.avatar,
      roleName: actor.roleName,
    };
  }
}
