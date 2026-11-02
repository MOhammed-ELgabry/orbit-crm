import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';

import type { ChatActor } from '../chat.types';

import {
  attachmentRow,
  COMPANY,
  directConversation,
  FakeAttachmentsRepository,
  OTHER_COMPANY,
  teamConversation,
} from './chat-attachments-test-doubles';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import {
  ATTACHMENT_DEFAULTS,
  ATTACHMENT_ERRORS,
} from './chat-attachments.constants';
import { ChatAttachmentsLinkService } from './chat-attachments-link.service';

const ON: ChatAttachmentsConfig = {
  enabled: true,
  storageDir: '/unused',
  ...ATTACHMENT_DEFAULTS,
};

const actor = (userId = 'u1', companyId = COMPANY): ChatActor => ({
  userId,
  companyId,
  firstName: 'U',
  lastName: userId,
  avatar: null,
  roleName: null,
});

describe('ChatAttachmentsLinkService (attachment fits the message being sent)', () => {
  let repo: FakeAttachmentsRepository;
  let service: ChatAttachmentsLinkService;

  beforeEach(() => {
    repo = new FakeAttachmentsRepository();
    service = new ChatAttachmentsLinkService(ON, repo);
  });

  it("accepts the uploader's READY attachment of the same conversation", async () => {
    repo.add(attachmentRow());

    await expect(
      service.requireLinkable(actor(), directConversation(), 'att-1'),
    ).resolves.toMatchObject({
      id: 'att-1',
      kind: 'IMAGE',
      displayName: 'photo.png',
    });
  });

  it('does not expose storage keys or paths in the public metadata', async () => {
    repo.add(attachmentRow());

    const dto = await service.requireLinkable(
      actor(),
      directConversation(),
      'att-1',
    );

    expect(Object.keys(dto).sort()).toEqual([
      'contentType',
      'displayName',
      'height',
      'id',
      'kind',
      'sizeBytes',
      'width',
    ]);
    expect(JSON.stringify(dto)).not.toContain(COMPANY);
  });

  it('is disabled when the feature is off', async () => {
    const off = new ChatAttachmentsLinkService(
      { enabled: false, reason: 'flag_off' },
      repo,
    );

    expect(off.enabled).toBe(false);
    await expect(
      off.requireLinkable(actor(), directConversation(), 'att-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses team conversations', async () => {
    await expect(
      service.requireLinkable(actor(), teamConversation(), 'att-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ["another user's attachment", attachmentRow({ uploaderKey: 'u2' })],
    [
      'an attachment of another conversation',
      attachmentRow({ conversationId: 'dm-2' }),
    ],
    [
      'an attachment of another company',
      attachmentRow({ companyId: OTHER_COMPANY }),
    ],
  ])(
    'treats %s as not found (indistinguishable from a missing one)',
    async (_label, row) => {
      repo.add(row);

      await expect(
        service.requireLinkable(actor(), directConversation(), 'att-1'),
      ).rejects.toThrow(ATTACHMENT_ERRORS.notFound);
      await expect(
        service.requireLinkable(actor(), directConversation(), 'missing'),
      ).rejects.toThrow(ATTACHMENT_ERRORS.notFound);
    },
  );

  it('refuses an attachment that is already attached to a message (no reuse)', async () => {
    repo.add(
      attachmentRow({ status: 'ATTACHED', messageId: 'm1', expiresAt: null }),
    );

    await expect(
      service.requireLinkable(actor(), directConversation(), 'att-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an attachment whose upload has not finished', async () => {
    repo.add(attachmentRow({ status: 'UPLOADING', readyAt: null }));

    await expect(
      service.requireLinkable(actor(), directConversation(), 'att-1'),
    ).rejects.toThrow(ATTACHMENT_ERRORS.notReady);
  });

  it('refuses an expired attachment, by status or by time (410)', async () => {
    repo.add(attachmentRow({ id: 'a', status: 'EXPIRED' }));
    repo.add(
      attachmentRow({ id: 'b', expiresAt: new Date(Date.now() - 1000) }),
    );

    for (const id of ['a', 'b']) {
      await expect(
        service.requireLinkable(actor(), directConversation(), id),
      ).rejects.toBeInstanceOf(GoneException);
    }
  });

  describe('describeForMessages', () => {
    it('returns metadata for attached rows of THIS company only', async () => {
      repo.add(
        attachmentRow({
          id: 'a1',
          status: 'ATTACHED',
          messageId: 'm1',
          expiresAt: null,
        }),
      );
      repo.add(
        attachmentRow({
          id: 'a2',
          companyId: OTHER_COMPANY,
          status: 'ATTACHED',
          messageId: 'm2',
          expiresAt: null,
          storageKey: `${OTHER_COMPANY}/aa/z`,
        }),
      );
      repo.add(attachmentRow({ id: 'a3', status: 'READY' }));

      const map = await service.describeForMessages(COMPANY, [
        'm1',
        'm2',
        'm3',
      ]);

      expect([...map.keys()]).toEqual(['m1']);
    });

    it('does no lookup at all when the feature is off', async () => {
      const spy = jest.spyOn(repo, 'findByMessageIds');
      const off = new ChatAttachmentsLinkService(
        { enabled: false, reason: 'flag_off' },
        repo,
      );

      expect((await off.describeForMessages(COMPANY, ['m1'])).size).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
