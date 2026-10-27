/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await -- jest mocks are asserted through detached method references; async mock implementations mirror the repository contract */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { SEND_MAX_ATTEMPTS } from './chat.constants';
import type {
  ChatConversationRow,
  ChatMessageRow,
  IChatRepository,
} from './chat.repository.interface';
import { ChatService } from './chat.service';
import type {
  PublishChatMessageInput,
  PublishChatMessageResult,
} from '../notification/entities/notification.entity';
import type { NotificationService } from '../notification/notification.service';
import { ChatEligibilityService } from './chat-eligibility.service';
import { ChatHub } from './chat-hub.service';
import type { HubConnection } from './chat-hub.service';
import type { ChatPresenceService } from './chat-presence.service';
import type { ChatServerEvent } from './chat.types';

// "u1" < "u2" < "u3": the canonical (low, high) order of the pairs below.
const COMPANY = 'company-a';
const OTHER_COMPANY = 'company-b';
const NOW = new Date('2026-10-12T08:00:00.000Z');

const direct = (
  overrides: Partial<ChatConversationRow> = {},
): ChatConversationRow => ({
  id: 'dm-1',
  companyId: COMPANY,
  type: 'DIRECT',
  conversationKey: 'DIRECT:2:u1:2:u2',
  directUserLowKey: 'u1',
  directUserHighKey: 'u2',
  nextSequence: 0,
  updatedAt: NOW,
  ...overrides,
});

const team = (
  overrides: Partial<ChatConversationRow> = {},
): ChatConversationRow => ({
  id: 'team-1',
  companyId: COMPANY,
  type: 'TEAM',
  conversationKey: 'TEAM',
  directUserLowKey: null,
  directUserHighKey: null,
  nextSequence: 0,
  updatedAt: NOW,
  ...overrides,
});

const message = (overrides: Partial<ChatMessageRow> = {}): ChatMessageRow => ({
  id: 'm1',
  conversationId: 'dm-1',
  sequence: 1,
  senderKey: 'u1',
  senderName: 'User One',
  senderAvatar: null,
  clientMessageId: 'client-msg-0001',
  body: 'hello',
  audienceEpoch: null,
  createdAt: NOW,
  ...overrides,
});

type Repo = jest.Mocked<IChatRepository>;

function makeRepository(): Repo {
  const repo: Partial<Record<keyof IChatRepository, jest.Mock>> = {};
  const names: (keyof IChatRepository)[] = [
    'findActor',
    'findEligibleUsers',
    'findPeers',
    'getRoleNames',
    'getAvatars',
    'ensureTeamConversation',
    'findConversationById',
    'findDirectConversation',
    'createDirectConversation',
    'isParticipant',
    'listDirectConversations',
    'getTeamState',
    'getParticipantReadSequences',
    'findMessageByClientId',
    'insertMessage',
    'listMessages',
    'getLastMessages',
    'getLastVisibleTeamMessage',
    'getAudienceMembers',
    'getCurrentMembers',
    'getTeamCursors',
    'markDirectRead',
    'markTeamRead',
    'countDirectUnread',
  ];
  for (const name of names) repo[name] = jest.fn();

  const r = repo as Repo;
  r.findActor.mockImplementation(async (id: string) => ({
    id,
    companyId: COMPANY,
    firstName: 'User',
    lastName: id,
    avatar: null,
    roleName: 'Agent',
  }));
  r.getRoleNames.mockResolvedValue(new Map());
  r.getAvatars.mockResolvedValue(new Map());
  r.getParticipantReadSequences.mockResolvedValue(new Map());
  r.getTeamCursors.mockResolvedValue(new Map());
  r.getCurrentMembers.mockResolvedValue([]);
  r.getAudienceMembers.mockResolvedValue([]);
  r.findMessageByClientId.mockResolvedValue(null);
  r.isParticipant.mockResolvedValue(true);
  r.findPeers.mockImplementation(async (_company: string, ids: string[]) =>
    ids.map((id) => ({
      id,
      firstName: 'Peer',
      lastName: id,
      avatar: null,
      roleName: null,
      eligible: true,
      exists: true,
    })),
  );
  return r;
}

describe('ChatService', () => {
  let repo: Repo;
  let hub: ChatHub;
  let presence: { getPresence: jest.Mock };
  let notifications: {
    publishChatMessage: jest.Mock<
      Promise<PublishChatMessageResult>,
      [PublishChatMessageInput]
    >;
    markChatConversationRead: jest.Mock;
  };
  let service: ChatService;
  let received: Record<string, ChatServerEvent[]>;

  function listen(userId: string, companyId = COMPANY): void {
    received[userId] = [];
    const connection: HubConnection = {
      id: `conn-${userId}`,
      userId,
      companyId,
      send: (event) => received[userId].push(event),
    };
    hub.register(connection);
  }

  beforeEach(() => {
    repo = makeRepository();
    hub = new ChatHub();
    presence = { getPresence: jest.fn().mockResolvedValue(new Map()) };
    received = {};

    notifications = {
      publishChatMessage: jest
        .fn<Promise<PublishChatMessageResult>, [PublishChatMessageInput]>()
        .mockResolvedValue({ notifiedUserIds: [] }),
      markChatConversationRead: jest.fn().mockResolvedValue({ updated: 0 }),
    };

    service = new ChatService(
      repo,
      new ChatEligibilityService(repo),
      hub,
      presence as unknown as ChatPresenceService,
      notifications as unknown as NotificationService,
    );
  });

  // -------------------------------------------------------------------
  describe('eligibility (chat-specific authorization)', () => {
    it('rejects an unknown / ineligible / missing caller with one uniform 403', async () => {
      repo.findActor.mockResolvedValueOnce(null);

      await expect(service.getSession('ghost')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.getSession(undefined as unknown as string),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('takes the company from the DATABASE row, not from anything the client sent', async () => {
      repo.findActor.mockResolvedValueOnce({
        id: 'u1',
        companyId: 'moved-company',
        firstName: 'A',
        lastName: 'B',
        avatar: null,
        roleName: null,
      });

      const session = await service.getSession('u1');

      expect(session.me.companyId).toBe('moved-company');
    });
  });

  // -------------------------------------------------------------------
  describe('authorize (conversation access)', () => {
    const actor = (userId: string, companyId = COMPANY) => ({
      userId,
      companyId,
      firstName: 'A',
      lastName: 'B',
      avatar: null,
      roleName: null,
    });

    it('answers 404 for an unknown conversation', async () => {
      repo.findConversationById.mockResolvedValue(null);

      await expect(
        service.authorize(actor('u1'), 'nope'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("answers the SAME 404 for another company's conversation (no cross-tenant probing)", async () => {
      repo.findConversationById.mockResolvedValue(
        team({ companyId: OTHER_COMPANY }),
      );

      await expect(service.authorize(actor('u1'), 'team-1')).rejects.toThrow(
        'Conversation not found.',
      );
    });

    it('answers 404 for a direct conversation the caller is not part of', async () => {
      repo.findConversationById.mockResolvedValue(direct());

      await expect(
        service.authorize(actor('u3'), 'dm-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.isParticipant).not.toHaveBeenCalled();
    });

    it('answers 404 when the participant row is missing even if the pair key matches', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.isParticipant.mockResolvedValue(false);

      await expect(
        service.authorize(actor('u1'), 'dm-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('grants access to either participant and to any company member for TEAM', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      await expect(
        service.authorize(actor('u1'), 'dm-1'),
      ).resolves.toMatchObject({ id: 'dm-1' });
      await expect(
        service.authorize(actor('u2'), 'dm-1'),
      ).resolves.toMatchObject({ id: 'dm-1' });

      repo.findConversationById.mockResolvedValue(team());
      await expect(
        service.authorize(actor('u3'), 'team-1'),
      ).resolves.toMatchObject({ id: 'team-1' });
    });
  });

  // -------------------------------------------------------------------
  describe('openDirectConversation', () => {
    beforeEach(() => {
      repo.getTeamState.mockResolvedValue({
        conversation: team(),
        readSequence: 0,
        unreadCount: 0,
      });
      repo.listDirectConversations.mockResolvedValue([]);
      repo.getLastMessages.mockResolvedValue(new Map());
      repo.getLastVisibleTeamMessage.mockResolvedValue(null);
    });

    it('refuses a conversation with yourself', async () => {
      await expect(
        service.openDirectConversation('u1', 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      ['an unknown / other-company user', []],
      [
        'an ineligible user',
        [
          {
            id: 'u2',
            firstName: 'x',
            lastName: 'y',
            avatar: null,
            roleName: null,
            eligible: false,
            exists: true,
          },
        ],
      ],
    ])('answers 404 for %s', async (_name, peers) => {
      repo.findPeers.mockResolvedValue(peers);

      await expect(
        service.openDirectConversation('u1', 'u2'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.createDirectConversation).not.toHaveBeenCalled();
    });

    it('creates the canonical pair once and reuses it afterwards', async () => {
      const conversation = direct();
      repo.findDirectConversation.mockResolvedValueOnce(null);
      repo.createDirectConversation.mockResolvedValue(conversation);
      repo.findConversationById.mockResolvedValue(conversation);

      const created = await service.openDirectConversation('u2', 'u1');

      // Opened by the HIGH id, stored as (low, high).
      expect(repo.findDirectConversation).toHaveBeenCalledWith(
        COMPANY,
        'u1',
        'u2',
      );
      expect(repo.createDirectConversation).toHaveBeenCalledWith(
        COMPANY,
        'u1',
        'u2',
      );
      expect(created.type).toBe('DIRECT');
      expect(created.peer?.id).toBe('u1');

      repo.findDirectConversation.mockResolvedValue(conversation);
      await service.openDirectConversation('u1', 'u2');
      expect(repo.createDirectConversation).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  describe('sendMessage', () => {
    const dto = { clientMessageId: 'client-msg-0001', body: 'hello' };

    beforeEach(() => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.insertMessage.mockResolvedValue({
        message: message({ sequence: 1 }),
      });
    });

    it('persists, then publishes to exactly the two participants of a direct chat', async () => {
      listen('u1');
      listen('u2');
      listen('u3');

      const result = await service.sendMessage('u1', 'dm-1', dto);

      expect(result.duplicate).toBe(false);
      expect(result.message.sequence).toBe(1);
      expect(repo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'dm-1',
          companyId: COMPANY,
          type: 'DIRECT',
          senderId: 'u1',
          senderName: 'User u1',
          clientMessageId: dto.clientMessageId,
          body: dto.body,
        }),
      );
      expect(received.u1).toHaveLength(1);
      expect(received.u2).toHaveLength(1);
      expect(received.u3).toHaveLength(0);
      expect(received.u2[0]).toMatchObject({
        type: 'message.new',
        conversationType: 'DIRECT',
      });
    });

    it('ignores any identity the caller might smuggle in: sender comes from the server', async () => {
      await service.sendMessage('u1', 'dm-1', {
        ...dto,
        senderId: 'someone-else',
        companyId: OTHER_COMPANY,
      } as typeof dto);

      const input = repo.insertMessage.mock.calls[0][0];
      expect(input.senderId).toBe('u1');
      expect(input.companyId).toBe(COMPANY);
    });

    it('does not publish when persistence fails', async () => {
      listen('u2');
      repo.insertMessage.mockRejectedValue(new Error('disk full'));

      await expect(service.sendMessage('u1', 'dm-1', dto)).rejects.toThrow(
        'disk full',
      );
      expect(received.u2).toHaveLength(0);
    });

    it('is idempotent: a retry returns the stored message and publishes nothing', async () => {
      listen('u2');
      repo.findMessageByClientId.mockResolvedValue(message({ sequence: 7 }));

      const result = await service.sendMessage('u1', 'dm-1', dto);

      expect(result.duplicate).toBe(true);
      expect(result.message.sequence).toBe(7);
      expect(repo.insertMessage).not.toHaveBeenCalled();
      expect(received.u2).toHaveLength(0);
    });

    it('refuses to reuse a clientMessageId for a different body (409)', async () => {
      repo.findMessageByClientId.mockResolvedValue(
        message({ body: 'original' }),
      );

      await expect(
        service.sendMessage('u1', 'dm-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('resolves a unique-violation race to the winner instead of failing', async () => {
      repo.findMessageByClientId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(message({ sequence: 3 }));
      repo.insertMessage.mockRejectedValue({ code: 'P2002' });

      const result = await service.sendMessage('u1', 'dm-1', dto);

      expect(result).toMatchObject({
        duplicate: true,
        message: { sequence: 3 },
      });
      expect(repo.insertMessage).toHaveBeenCalledTimes(1);
    });

    it('retries a lost race (stale epoch / deadlock) and then succeeds', async () => {
      repo.insertMessage
        .mockRejectedValueOnce({ meta: { code: '40001' } })
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockResolvedValueOnce({ message: message({ sequence: 2 }) });

      const result = await service.sendMessage('u1', 'dm-1', dto);

      expect(result.message.sequence).toBe(2);
      expect(repo.insertMessage).toHaveBeenCalledTimes(3);
    });

    it('gives up after SEND_MAX_ATTEMPTS and surfaces the error', async () => {
      repo.insertMessage.mockRejectedValue({
        code: 'P2034',
        message: 'write conflict',
      });

      await expect(
        service.sendMessage('u1', 'dm-1', dto),
      ).rejects.toMatchObject({
        code: 'P2034',
      });
      expect(repo.insertMessage).toHaveBeenCalledTimes(SEND_MAX_ATTEMPTS);
    });

    it('maps the DB eligibility triggers to a uniform 403', async () => {
      repo.insertMessage.mockRejectedValue(
        new Error('chat: sender is not eligible'),
      );

      await expect(
        service.sendMessage('u1', 'dm-1', dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to send to a peer who is no longer eligible', async () => {
      repo.findPeers.mockResolvedValue([
        {
          id: 'u2',
          firstName: 'x',
          lastName: 'y',
          avatar: null,
          roleName: null,
          eligible: false,
          exists: true,
        },
      ]);

      await expect(
        service.sendMessage('u1', 'dm-1', dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('does not let a stranger send into a direct conversation (404, nothing stored)', async () => {
      await expect(
        service.sendMessage('u3', 'dm-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('a publish failure never fails the send (the message is already durable)', async () => {
      const conversation = team({ id: 'team-1' });
      repo.findConversationById.mockResolvedValue(conversation);
      repo.insertMessage.mockResolvedValue({
        message: message({ conversationId: 'team-1', audienceEpoch: 3 }),
      });
      repo.getAudienceMembers.mockRejectedValue(new Error('db hiccup'));

      await expect(
        service.sendMessage('u1', 'team-1', dto),
      ).resolves.toMatchObject({
        duplicate: false,
      });
    });

    describe('team audience (historical + still-a-member)', () => {
      beforeEach(() => {
        repo.findConversationById.mockResolvedValue(team());
        repo.insertMessage.mockResolvedValue({
          message: message({ conversationId: 'team-1', audienceEpoch: 5 }),
        });
      });

      it('delivers to the audience of the message epoch, minus people who already left, never to a later joiner', async () => {
        // At epoch 5: u1 (sender), u2, u3 (left since). u4 joined later.
        repo.getAudienceMembers.mockResolvedValue(['u1', 'u2', 'u3']);
        repo.getCurrentMembers.mockResolvedValue(['u1', 'u2', 'u4']);
        ['u1', 'u2', 'u3', 'u4'].forEach((u) => listen(u));
        listen('outsider', OTHER_COMPANY);

        await service.sendMessage('u1', 'team-1', dto);

        expect(repo.getAudienceMembers).toHaveBeenCalledWith(COMPANY, 5);
        expect(received.u1).toHaveLength(1);
        expect(received.u2).toHaveLength(1);
        expect(received.u3).toHaveLength(0); // left: no live copy
        expect(received.u4).toHaveLength(0); // joined later: not in the audience
        expect(received.outsider).toHaveLength(0);
      });

      it('caches the audience per (company, epoch)', async () => {
        repo.getAudienceMembers.mockResolvedValue(['u1', 'u2']);
        repo.getCurrentMembers.mockResolvedValue(['u1', 'u2']);

        await service.sendMessage('u1', 'team-1', {
          ...dto,
          clientMessageId: 'client-msg-0002',
        });
        await service.sendMessage('u1', 'team-1', {
          ...dto,
          clientMessageId: 'client-msg-0003',
        });

        expect(repo.getAudienceMembers).toHaveBeenCalledTimes(1);
      });
    });
  });

  // -------------------------------------------------------------------
  describe('receipts', () => {
    it('direct: one check = persisted (0/1), two checks once the peer cursor reaches it', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.listMessages.mockResolvedValue([
        message({ id: 'm1', sequence: 1 }),
        message({ id: 'm2', sequence: 2 }),
        message({ id: 'm3', sequence: 3, senderKey: 'u2' }), // not mine: no receipt
      ]);
      repo.getParticipantReadSequences.mockResolvedValue(new Map([['u2', 1]]));

      const page = await service.getMessages('u1', 'dm-1', { limit: 30 });
      const byId = new Map(page.messages.map((m) => [m.id, m]));

      expect(byId.get('m1')?.receipt).toEqual({
        readCount: 1,
        recipientCount: 1,
      });
      expect(byId.get('m2')?.receipt).toEqual({
        readCount: 0,
        recipientCount: 1,
      });
      expect(byId.get('m3')?.receipt).toBeNull();
    });

    it('team: recipients = historical audience − sender, restricted to current members', async () => {
      repo.findConversationById.mockResolvedValue(team());
      repo.listMessages.mockResolvedValue([
        message({
          id: 't1',
          conversationId: 'team-1',
          sequence: 4,
          audienceEpoch: 2,
        }),
      ]);
      // epoch 2: u1 (sender), u2, u3, u5 (u5 has since left). u4 joined after.
      repo.getAudienceMembers.mockResolvedValue(['u1', 'u2', 'u3', 'u5']);
      repo.getCurrentMembers.mockResolvedValue(['u1', 'u2', 'u3', 'u4']);
      repo.getTeamCursors.mockResolvedValue(
        new Map([
          ['u2', 4], // read it
          ['u3', 3], // not yet
          ['u4', 99], // joined later: must not count
          ['u5', 99], // left: must not count
        ]),
      );

      const { messages } = await service.getMessages('u1', 'team-1', {
        limit: 30,
      });

      expect(messages[0].receipt).toEqual({ readCount: 1, recipientCount: 2 });
    });

    it("getReceipts validates the range and returns only the caller's own messages", async () => {
      repo.findConversationById.mockResolvedValue(direct());

      await expect(
        service.getReceipts('u1', 'dm-1', 5, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.getReceipts('u1', 'dm-1', 1, 600),
      ).rejects.toBeInstanceOf(BadRequestException);

      repo.listMessages.mockResolvedValue([
        message({ id: 'm1', sequence: 1 }),
        message({ id: 'm2', sequence: 2, senderKey: 'u2' }),
        message({ id: 'm3', sequence: 9 }), // beyond `to`
      ]);
      repo.getParticipantReadSequences.mockResolvedValue(new Map([['u2', 5]]));

      const { receipts } = await service.getReceipts('u1', 'dm-1', 1, 5);

      expect(receipts).toEqual([
        { id: 'm1', sequence: 1, readCount: 1, recipientCount: 1 },
      ]);
    });
  });

  // -------------------------------------------------------------------
  describe('getMessages', () => {
    beforeEach(() =>
      repo.findConversationById.mockResolvedValue(direct({ nextSequence: 10 })),
    );

    it('rejects before + after together', async () => {
      await expect(
        service.getMessages('u1', 'dm-1', { before: 5, after: 1, limit: 30 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('older page: asks for limit+1 and drops the OLDEST extra row', async () => {
      repo.listMessages.mockResolvedValue(
        [3, 4, 5].map((s) =>
          message({ id: `m${s}`, sequence: s, senderKey: 'u2' }),
        ),
      );

      const page = await service.getMessages('u1', 'dm-1', {
        before: 6,
        limit: 2,
      });

      expect(repo.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ before: 6, limit: 3, viewerId: 'u1' }),
      );
      expect(page.hasMore).toBe(true);
      expect(page.messages.map((m) => m.sequence)).toEqual([4, 5]);
      expect(page.lastSequence).toBe(10);
    });

    it('recovery page: drops the NEWEST extra row so no message is skipped', async () => {
      repo.listMessages.mockResolvedValue(
        [6, 7, 8].map((s) =>
          message({ id: `m${s}`, sequence: s, senderKey: 'u2' }),
        ),
      );

      const page = await service.getMessages('u1', 'dm-1', {
        after: 5,
        limit: 2,
      });

      expect(page.hasMore).toBe(true);
      expect(page.messages.map((m) => m.sequence)).toEqual([6, 7]);
    });

    it('reports hasMore=false on the last page', async () => {
      repo.listMessages.mockResolvedValue([
        message({ sequence: 1, senderKey: 'u2' }),
      ]);

      const page = await service.getMessages('u1', 'dm-1', { limit: 30 });

      expect(page.hasMore).toBe(false);
    });

    describe('sender pictures', () => {
      const LIVE = '/users/u2/avatar?v=aaaaaaaaaaaaaaaa';

      it("shows the sender's CURRENT picture, not the one stored with the message", async () => {
        repo.listMessages.mockResolvedValue([
          message({
            sequence: 1,
            senderKey: 'u2',
            senderAvatar: '/users/u2/avatar?v=00000000old00000',
          }),
        ]);
        repo.getAvatars.mockResolvedValue(new Map([['u2', LIVE]]));

        const page = await service.getMessages('u1', 'dm-1', { limit: 30 });

        expect(page.messages[0].senderAvatar).toBe(LIVE);
      });

      it("asks for pictures inside the caller's company only", async () => {
        repo.listMessages.mockResolvedValue([
          message({ sequence: 1, senderKey: 'u2' }),
          message({ id: 'm2', sequence: 2, senderKey: 'u2' }),
        ]);

        await service.getMessages('u1', 'dm-1', { limit: 30 });

        expect(repo.getAvatars).toHaveBeenCalledWith(COMPANY, ['u2']);
      });

      it('never passes on a snapshot or an external URL: a sender with no current picture shows initials', async () => {
        repo.listMessages.mockResolvedValue([
          message({
            sequence: 1,
            senderKey: 'u2',
            senderAvatar: 'https://lh3.googleusercontent.com/a/tracker',
          }),
          message({
            id: 'm-gone',
            sequence: 2,
            senderKey: 'deleted-user',
            senderAvatar: '/users/deleted-user/avatar?v=aaaaaaaaaaaaaaaa',
          }),
        ]);
        repo.getAvatars.mockResolvedValue(new Map([['u2', null]]));

        const page = await service.getMessages('u1', 'dm-1', { limit: 30 });

        expect(page.messages.map((m) => m.senderAvatar)).toEqual([null, null]);
      });
    });
  });

  // -------------------------------------------------------------------
  describe('markRead', () => {
    it('direct: a real advance notifies both participants (and nobody else)', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.markDirectRead.mockResolvedValue({
        readSequence: 4,
        previousSequence: 1,
        advanced: true,
      });
      repo.countDirectUnread.mockResolvedValue(2);
      ['u1', 'u2', 'u3'].forEach((u) => listen(u));

      const result = await service.markRead('u2', 'dm-1', 4);

      expect(result).toEqual({
        conversationId: 'dm-1',
        readSequence: 4,
        unreadCount: 2,
      });
      expect(received.u1[0]).toMatchObject({
        type: 'read.updated',
        readerId: 'u2',
        upToSequence: 4,
      });
      expect(received.u2).toHaveLength(1);
      expect(received.u3).toHaveLength(0);
    });

    it('direct: a no-op (cursor did not move) publishes nothing', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.markDirectRead.mockResolvedValue({
        readSequence: 4,
        previousSequence: 4,
        advanced: false,
      });
      repo.countDirectUnread.mockResolvedValue(0);
      listen('u1');

      await service.markRead('u2', 'dm-1', 2);

      expect(received.u1).toHaveLength(0);
    });

    it('team: notifies current members only', async () => {
      repo.findConversationById.mockResolvedValue(team());
      repo.markTeamRead.mockResolvedValue({
        readSequence: 3,
        previousSequence: 0,
        advanced: true,
      });
      repo.getCurrentMembers.mockResolvedValue(['u1', 'u2']);
      repo.getTeamState.mockResolvedValue({
        conversation: team(),
        readSequence: 3,
        unreadCount: 0,
      });
      ['u1', 'u2', 'u9'].forEach((u) => listen(u));

      const result = await service.markRead('u2', 'team-1', 3);

      expect(result.unreadCount).toBe(0);
      expect(received.u1).toHaveLength(1);
      expect(received.u9).toHaveLength(0);
    });

    it('cannot mark a conversation the caller has no access to', async () => {
      repo.findConversationById.mockResolvedValue(direct());

      await expect(service.markRead('u3', 'dm-1', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.markDirectRead).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  describe('notifications (Notification module integration)', () => {
    const dto = { clientMessageId: 'client-msg-0001', body: 'hello' };

    const sendDirect = async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.insertMessage.mockResolvedValue({
        message: message({ sequence: 5, id: 'm5', body: 'hello' }),
      });
      const result = await service.sendMessage('u1', 'dm-1', dto);
      await service.flushNotifications();
      return result;
    };

    const teamRow = (overrides: Partial<ChatMessageRow> = {}) =>
      message({
        id: 'tm9',
        conversationId: 'team-1',
        sequence: 9,
        audienceEpoch: 4,
        body: 'hello team',
        ...overrides,
      });

    it('DIRECT: notifies only the peer, with ids taken from the server rows', async () => {
      await sendDirect();

      expect(notifications.publishChatMessage).toHaveBeenCalledTimes(1);
      expect(notifications.publishChatMessage).toHaveBeenCalledWith({
        companyId: COMPANY,
        senderId: 'u1',
        conversationId: 'dm-1',
        conversationType: 'DIRECT',
        messageId: 'm5',
        sequence: 5,
        body: 'hello',
        recipientIds: ['u2'],
      });
    });

    it('does not take the company, sender or recipients from the client payload', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.insertMessage.mockResolvedValue({ message: message({ id: 'm5' }) });

      await service.sendMessage('u1', 'dm-1', {
        ...dto,
        companyId: OTHER_COMPANY,
        senderId: 'u3',
        recipientIds: ['u3'],
      } as typeof dto);
      await service.flushNotifications();

      const input = notifications.publishChatMessage.mock.calls[0][0];
      expect(input.companyId).toBe(COMPANY);
      expect(input.senderId).toBe('u1');
      expect(input.recipientIds).toEqual(['u2']);
    });

    it('TEAM: notifies the message audience that is still a member, never the sender', async () => {
      repo.findConversationById.mockResolvedValue(team());
      repo.insertMessage.mockResolvedValue({ message: teamRow() });
      // Audience at epoch 4: u1 (sender), u2, u3, u4. u4 has left since.
      repo.getAudienceMembers.mockResolvedValue(['u1', 'u2', 'u3', 'u4']);
      repo.getCurrentMembers.mockResolvedValue(['u1', 'u2', 'u3', 'u5']);

      await service.sendMessage('u1', 'team-1', dto);
      await service.flushNotifications();

      expect(repo.getAudienceMembers).toHaveBeenCalledWith(COMPANY, 4);
      const input = notifications.publishChatMessage.mock.calls[0][0];
      expect(input.conversationType).toBe('TEAM');
      // u5 joined AFTER the message (not in the audience) and u4 left.
      expect([...input.recipientIds].sort()).toEqual(['u2', 'u3']);
    });

    it('computes the TEAM audience once for the live event and the notification', async () => {
      repo.findConversationById.mockResolvedValue(team());
      repo.insertMessage.mockResolvedValue({ message: teamRow() });
      repo.getAudienceMembers.mockResolvedValue(['u1', 'u2']);
      repo.getCurrentMembers.mockResolvedValue(['u1', 'u2']);

      await service.sendMessage('u1', 'team-1', dto);
      await service.flushNotifications();

      // Two calls in total: one for the sender's receipt, one shared by the
      // live event and the notification (not a third for the notification).
      expect(repo.getCurrentMembers).toHaveBeenCalledTimes(2);
    });

    it('does not notify when persistence fails (nothing is notified before the save)', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.insertMessage.mockRejectedValue(new Error('disk full'));

      await expect(service.sendMessage('u1', 'dm-1', dto)).rejects.toThrow(
        'disk full',
      );
      await service.flushNotifications();

      expect(notifications.publishChatMessage).not.toHaveBeenCalled();
    });

    it('does not notify a message that was refused by the eligibility triggers', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.insertMessage.mockRejectedValue(
        new Error('chat: sender is not eligible'),
      );

      await expect(
        service.sendMessage('u1', 'dm-1', dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await service.flushNotifications();

      expect(notifications.publishChatMessage).not.toHaveBeenCalled();
    });

    it('a failing notification never fails the send, and the live event is still delivered', async () => {
      listen('u2');
      notifications.publishChatMessage.mockRejectedValue(new Error('db down'));

      const result = await sendDirect();

      expect(result.duplicate).toBe(false);
      expect(received.u2).toHaveLength(1);
    });

    it('a failing audience lookup keeps the message published/answered and is retried for the notification', async () => {
      repo.findConversationById.mockResolvedValue(team());
      repo.insertMessage.mockResolvedValue({ message: teamRow() });
      repo.getAudienceMembers
        .mockRejectedValueOnce(new Error('hiccup'))
        .mockResolvedValue(['u1', 'u2']);
      repo.getCurrentMembers.mockResolvedValue(['u1', 'u2']);

      const result = await service.sendMessage('u1', 'team-1', dto);
      await service.flushNotifications();

      expect(result.duplicate).toBe(false);
      expect(notifications.publishChatMessage).toHaveBeenCalledTimes(1);
      expect(
        notifications.publishChatMessage.mock.calls[0][0].recipientIds,
      ).toEqual(['u2']);
    });

    it('the request does not wait for the notification work', async () => {
      let release: (value: { notifiedUserIds: string[] }) => void = () => {};
      notifications.publishChatMessage.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      repo.findConversationById.mockResolvedValue(direct());
      repo.insertMessage.mockResolvedValue({ message: message({ id: 'm5' }) });

      const result = await service.sendMessage('u1', 'dm-1', dto);

      // Returned although publishChatMessage has not settled yet.
      expect(result.duplicate).toBe(false);

      release({ notifiedUserIds: [] });
      await service.flushNotifications();
    });

    it('a retry of an already stored message re-runs the (idempotent) notification step', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.findMessageByClientId.mockResolvedValue(
        message({ id: 'm5', sequence: 5, body: 'hello' }),
      );

      const result = await service.sendMessage('u1', 'dm-1', dto);
      await service.flushNotifications();

      expect(result.duplicate).toBe(true);
      expect(repo.insertMessage).not.toHaveBeenCalled();
      expect(notifications.publishChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'm5', recipientIds: ['u2'] }),
      );
    });

    it('a retry with a DIFFERENT body is refused and notifies nothing', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.findMessageByClientId.mockResolvedValue(
        message({ body: 'original' }),
      );

      await expect(
        service.sendMessage('u1', 'dm-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
      await service.flushNotifications();

      expect(notifications.publishChatMessage).not.toHaveBeenCalled();
    });

    it('a unique-violation race resolves to the winner and re-runs the notification step', async () => {
      repo.findConversationById.mockResolvedValue(direct());
      repo.findMessageByClientId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(message({ id: 'winner', sequence: 3 }));
      repo.insertMessage.mockRejectedValue({ code: 'P2002' });

      await service.sendMessage('u1', 'dm-1', dto);
      await service.flushNotifications();

      expect(notifications.publishChatMessage).toHaveBeenCalledTimes(1);
      expect(notifications.publishChatMessage.mock.calls[0][0].messageId).toBe(
        'winner',
      );
    });

    describe('read-state reconciliation after creating the rows', () => {
      it('DIRECT: if the peer already read past the message, the new row is marked read', async () => {
        notifications.publishChatMessage.mockResolvedValue({
          notifiedUserIds: ['u2'],
        });
        repo.getParticipantReadSequences.mockResolvedValue(
          new Map([['u2', 6]]),
        );

        await sendDirect();

        expect(notifications.markChatConversationRead).toHaveBeenCalledWith(
          COMPANY,
          'u2',
          'dm-1',
          6,
        );
      });

      it('DIRECT: a peer who has NOT read it keeps an unread row', async () => {
        notifications.publishChatMessage.mockResolvedValue({
          notifiedUserIds: ['u2'],
        });
        repo.getParticipantReadSequences.mockResolvedValue(
          new Map([['u2', 4]]),
        );

        await sendDirect();

        expect(notifications.markChatConversationRead).not.toHaveBeenCalled();
      });

      it('TEAM: only recipients whose cursor passed the message are marked', async () => {
        repo.findConversationById.mockResolvedValue(team());
        repo.insertMessage.mockResolvedValue({ message: teamRow() });
        repo.getAudienceMembers.mockResolvedValue(['u1', 'u2', 'u3']);
        repo.getCurrentMembers.mockResolvedValue(['u1', 'u2', 'u3']);
        notifications.publishChatMessage.mockResolvedValue({
          notifiedUserIds: ['u2', 'u3'],
        });
        repo.getTeamCursors.mockResolvedValue(
          new Map([
            ['u2', 12],
            ['u3', 2],
          ]),
        );

        await service.sendMessage('u1', 'team-1', dto);
        await service.flushNotifications();

        expect(notifications.markChatConversationRead).toHaveBeenCalledTimes(1);
        expect(notifications.markChatConversationRead).toHaveBeenCalledWith(
          COMPANY,
          'u2',
          'team-1',
          12,
        );
      });

      it('nothing is looked up when no row was created or advanced', async () => {
        notifications.publishChatMessage.mockResolvedValue({
          notifiedUserIds: [],
        });

        await sendDirect();

        // Only the sender's receipt lookup (1 call) - no reconciliation.
        expect(repo.getParticipantReadSequences).toHaveBeenCalledTimes(1);
        expect(notifications.markChatConversationRead).not.toHaveBeenCalled();
      });
    });

    describe('markRead -> notification read (one direction only)', () => {
      it("DIRECT: marks the reader's own notifications up to the REAL cursor", async () => {
        repo.findConversationById.mockResolvedValue(direct());
        repo.markDirectRead.mockResolvedValue({
          readSequence: 4,
          previousSequence: 1,
          advanced: true,
        });
        repo.countDirectUnread.mockResolvedValue(0);

        await service.markRead('u2', 'dm-1', 99);

        expect(notifications.markChatConversationRead).toHaveBeenCalledWith(
          COMPANY,
          'u2',
          'dm-1',
          4, // the cursor the repository reports, not the 99 the client sent
        );
      });

      it('TEAM: marks with the real cursor as well', async () => {
        repo.findConversationById.mockResolvedValue(team());
        repo.markTeamRead.mockResolvedValue({
          readSequence: 8,
          previousSequence: 2,
          advanced: true,
        });
        repo.getCurrentMembers.mockResolvedValue(['u1', 'u2']);
        repo.getTeamState.mockResolvedValue({
          conversation: team(),
          readSequence: 8,
          unreadCount: 1,
        });

        await service.markRead('u2', 'team-1', 99);

        expect(notifications.markChatConversationRead).toHaveBeenCalledWith(
          COMPANY,
          'u2',
          'team-1',
          8,
        );
      });

      it('also catches up when the cursor did not move (an earlier sync may have failed)', async () => {
        repo.findConversationById.mockResolvedValue(direct());
        repo.markDirectRead.mockResolvedValue({
          readSequence: 4,
          previousSequence: 4,
          advanced: false,
        });
        repo.countDirectUnread.mockResolvedValue(0);

        await service.markRead('u2', 'dm-1', 4);

        expect(notifications.markChatConversationRead).toHaveBeenCalledTimes(1);
      });

      it('a failing sync never fails the read acknowledgement', async () => {
        repo.findConversationById.mockResolvedValue(direct());
        repo.markDirectRead.mockResolvedValue({
          readSequence: 4,
          previousSequence: 1,
          advanced: true,
        });
        repo.countDirectUnread.mockResolvedValue(0);
        notifications.markChatConversationRead.mockRejectedValue(
          new Error('db down'),
        );

        await expect(service.markRead('u2', 'dm-1', 4)).resolves.toMatchObject({
          readSequence: 4,
        });
      });

      it("an unauthorised caller cannot touch anyone's notifications", async () => {
        repo.findConversationById.mockResolvedValue(direct());

        await expect(service.markRead('u3', 'dm-1', 1)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(notifications.markChatConversationRead).not.toHaveBeenCalled();
      });

      it('a conversation of another company is a 404 and touches nothing', async () => {
        repo.findConversationById.mockResolvedValue(
          direct({ companyId: OTHER_COMPANY }),
        );

        await expect(service.markRead('u1', 'dm-1', 1)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(notifications.markChatConversationRead).not.toHaveBeenCalled();
      });
    });
  });
});
