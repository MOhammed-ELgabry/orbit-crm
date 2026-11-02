/* eslint-disable @typescript-eslint/unbound-method -- jest mocks are asserted through detached method references */
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';

import {
  attachmentRow,
  COMPANY,
  directConversation,
  FakeAttachmentsRepository,
  makeChatRepositoryStub,
  OTHER_COMPANY,
  teamConversation,
} from './attachments/chat-attachments-test-doubles';
import {
  ATTACHMENT_DEFAULTS,
  ATTACHMENT_ERRORS,
} from './attachments/chat-attachments.constants';
import { ChatAttachmentsLinkService } from './attachments/chat-attachments-link.service';
import type { ChatAttachmentsPort } from './attachments/chat-attachments.port';
import { ChatEligibilityService } from './chat-eligibility.service';
import { ChatHub } from './chat-hub.service';
import {
  AttachmentLinkError,
  type ChatMessageRow,
} from './chat.repository.interface';
import { ChatService } from './chat.service';
import type { ChatServerEvent } from './chat.types';

const NOW = new Date('2026-11-01T10:00:00.000Z');

const stored = (overrides: Partial<ChatMessageRow> = {}): ChatMessageRow => ({
  id: 'm1',
  conversationId: 'dm-1',
  sequence: 1,
  senderKey: 'u1',
  senderName: 'User u1',
  senderAvatar: null,
  clientMessageId: 'client-msg-0001',
  body: 'hello',
  audienceEpoch: null,
  createdAt: NOW,
  ...overrides,
});

describe('ChatService - sending messages with attachments (no database)', () => {
  const dto = { clientMessageId: 'client-msg-0001', body: 'hello' };

  let repo: ReturnType<typeof makeChatRepositoryStub>;
  let attachments: FakeAttachmentsRepository;
  let hub: ChatHub;
  let received: ChatServerEvent[];
  let notifications: { publishChatMessage: jest.Mock };

  function build(port?: ChatAttachmentsPort | 'none') {
    repo = makeChatRepositoryStub([directConversation(), teamConversation()]);
    repo.insertMessage.mockImplementation((input: { body: string }) =>
      Promise.resolve({ message: stored({ body: input.body }) }),
    );
    hub = new ChatHub();
    received = [];
    hub.register({
      id: 'c-u2',
      userId: 'u2',
      companyId: COMPANY,
      send: (event) => received.push(event),
    });
    notifications = {
      publishChatMessage: jest.fn().mockResolvedValue({ notifiedUserIds: [] }),
    };

    return new ChatService(
      repo,
      new ChatEligibilityService(repo),
      hub,
      { getPresence: jest.fn().mockResolvedValue(new Map()) } as never,
      notifications as never,
      port === 'none' ? undefined : port,
    );
  }

  const linkPort = (enabled = true) => {
    attachments = new FakeAttachmentsRepository();

    return new ChatAttachmentsLinkService(
      enabled
        ? { enabled: true, storageDir: '/unused', ...ATTACHMENT_DEFAULTS }
        : { enabled: false, reason: 'flag_off' },
      attachments,
    );
  };

  // ------------------------------------------------------------------
  describe('existing text-only behaviour is unchanged (regression)', () => {
    it.each([
      ['no attachments module wired at all', 'none' as const],
      ['the feature switched off', undefined],
    ])(
      '%s: a text message is stored and published as before',
      async (_n, mode) => {
        const service = build(mode === 'none' ? 'none' : linkPort(false));

        const result = await service.sendMessage('u1', 'dm-1', dto);

        expect(result.duplicate).toBe(false);
        expect(result.message.body).toBe('hello');
        expect(result.message).not.toHaveProperty('attachment');

        const input = repo.insertMessage.mock.calls[0][0];
        expect(input).not.toHaveProperty('attachmentId');
        expect(received).toHaveLength(1);
      },
    );

    it('an empty body without an attachment is still refused', async () => {
      const service = build(linkPort());

      await expect(
        service.sendMessage('u1', 'dm-1', {
          clientMessageId: 'client-msg-0001',
          body: '',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('does not touch the attachments table to send plain text', async () => {
      const port = linkPort();
      const spy = jest.spyOn(port, 'requireLinkable');
      const service = build(port);

      await service.sendMessage('u1', 'dm-1', dto);

      expect(spy).not.toHaveBeenCalled();
    });

    it('a lookup failure for attachment metadata never breaks the message', async () => {
      const port = linkPort();
      jest
        .spyOn(port, 'describeForMessages')
        .mockRejectedValue(new Error('db down'));
      const service = build(port);
      repo.findMessageByClientId.mockResolvedValue(stored());

      const result = await service.sendMessage('u1', 'dm-1', dto);

      expect(result.duplicate).toBe(true);
      expect(result.message.body).toBe('hello');
    });
  });

  // ------------------------------------------------------------------
  describe('attachments', () => {
    it('sends text + attachment: the attachment id reaches the transaction, the DTO carries the metadata', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);

      const result = await service.sendMessage('u1', 'dm-1', {
        ...dto,
        attachmentId: 'att-1',
      } as typeof dto);

      expect(repo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentId: 'att-1',
          body: 'hello',
          senderId: 'u1',
        }),
      );
      expect(result.message.attachment).toMatchObject({
        id: 'att-1',
        displayName: 'photo.png',
      });
    });

    it('sends an attachment-only message (empty body)', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);

      const result = await service.sendMessage('u1', 'dm-1', {
        clientMessageId: 'client-msg-0001',
        attachmentId: 'att-1',
      } as never);

      expect(repo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentId: 'att-1', body: '' }),
      );
      expect(result.message.body).toBe('');
      expect(result.message.attachment?.id).toBe('att-1');
    });

    it('authorization comes first: a non-participant never reaches the attachment check', async () => {
      const port = linkPort();
      const spy = jest.spyOn(port, 'requireLinkable');
      attachments.add(attachmentRow());
      const service = build(port);
      repo.isParticipant.mockResolvedValue(false);

      await expect(
        service.sendMessage('u1', 'dm-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(spy).not.toHaveBeenCalled();
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('refuses an attachment while the feature is off (404, nothing stored)', async () => {
      const service = build(linkPort(false));

      await expect(
        service.sendMessage('u1', 'dm-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toThrow(ATTACHMENT_ERRORS.disabled);
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it("refuses someone else's, another conversation's, another company's, used and expired attachments", async () => {
      const port = linkPort();
      attachments.add(attachmentRow({ id: 'other-user', uploaderKey: 'u2' }));
      attachments.add(
        attachmentRow({ id: 'other-conv', conversationId: 'dm-2' }),
      );
      attachments.add(
        attachmentRow({ id: 'other-co', companyId: OTHER_COMPANY }),
      );
      attachments.add(
        attachmentRow({
          id: 'used',
          status: 'ATTACHED',
          messageId: 'm0',
          expiresAt: null,
        }),
      );
      attachments.add(
        attachmentRow({ id: 'old', expiresAt: new Date(Date.now() - 1000) }),
      );
      const service = build(port);

      const outcome = async (id: string) =>
        service
          .sendMessage('u1', 'dm-1', { ...dto, attachmentId: id } as typeof dto)
          .then(
            () => 'sent',
            (error: unknown) => error,
          );

      expect(await outcome('other-user')).toBeInstanceOf(NotFoundException);
      expect(await outcome('other-conv')).toBeInstanceOf(NotFoundException);
      expect(await outcome('other-co')).toBeInstanceOf(NotFoundException);
      expect(await outcome('used')).toBeInstanceOf(ConflictException);
      expect(await outcome('old')).toBeInstanceOf(GoneException);
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('refuses attachments in the team conversation', async () => {
      const port = linkPort();
      attachments.add(attachmentRow({ conversationId: 'team-1' }));
      const service = build(port);

      await expect(
        service.sendMessage('u1', 'team-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignores a company/sender smuggled in the payload', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);

      await service.sendMessage('u1', 'dm-1', {
        ...dto,
        attachmentId: 'att-1',
        senderId: 'u2',
        companyId: OTHER_COMPANY,
      } as never);

      const input = repo.insertMessage.mock.calls[0][0];
      expect(input.senderId).toBe('u1');
      expect(input.companyId).toBe(COMPANY);
    });
  });

  // ------------------------------------------------------------------
  describe('linking failure (the transaction rolled back as a whole)', () => {
    it('maps the link failure to 409 and publishes / notifies nothing', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);
      repo.insertMessage.mockRejectedValue(new AttachmentLinkError());

      await expect(
        service.sendMessage('u1', 'dm-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(received).toHaveLength(0);
      expect(notifications.publishChatMessage).not.toHaveBeenCalled();
    });

    it('maps a database trigger refusal about the attachment to the same 409', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);
      repo.insertMessage.mockRejectedValue(
        new Error(
          'attachment can only be linked to the newest message of the conversation',
        ),
      );

      await expect(
        service.sendMessage('u1', 'dm-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toThrow(ATTACHMENT_ERRORS.notReady);
    });

    it('does not turn unrelated failures into attachment errors', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);
      repo.insertMessage.mockRejectedValue(new Error('disk full'));

      await expect(
        service.sendMessage('u1', 'dm-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toThrow('disk full');
    });
  });

  // ------------------------------------------------------------------
  describe('idempotent retry', () => {
    it('returns the stored message (with its attachment) for the same id, body and attachment', async () => {
      const port = linkPort();
      attachments.add(
        attachmentRow({ status: 'ATTACHED', messageId: 'm1', expiresAt: null }),
      );
      const service = build(port);
      repo.findMessageByClientId.mockResolvedValue(stored({ body: '' }));

      const result = await service.sendMessage('u1', 'dm-1', {
        clientMessageId: 'client-msg-0001',
        attachmentId: 'att-1',
      } as never);

      expect(result.duplicate).toBe(true);
      expect(result.message.attachment?.id).toBe('att-1');
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('refuses to reuse a clientMessageId for a different attachment (409)', async () => {
      const port = linkPort();
      attachments.add(
        attachmentRow({ status: 'ATTACHED', messageId: 'm1', expiresAt: null }),
      );
      attachments.add(attachmentRow({ id: 'att-2' }));
      const service = build(port);
      repo.findMessageByClientId.mockResolvedValue(stored({ body: '' }));

      await expect(
        service.sendMessage('u1', 'dm-1', {
          clientMessageId: 'client-msg-0001',
          attachmentId: 'att-2',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to add an attachment to an id that was used for a text-only message', async () => {
      const port = linkPort();
      attachments.add(attachmentRow());
      const service = build(port);
      repo.findMessageByClientId.mockResolvedValue(stored());

      await expect(
        service.sendMessage('u1', 'dm-1', {
          ...dto,
          attachmentId: 'att-1',
        } as typeof dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
