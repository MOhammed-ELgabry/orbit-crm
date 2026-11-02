/* eslint-disable @typescript-eslint/unbound-method -- jest mocks are asserted through detached method references */
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import {
  attachmentRow,
  COMPANY,
  directConversation,
  FakeAttachmentsRepository,
  makeChatRepositoryStub,
  makeRealChat,
  OTHER_COMPANY,
  teamConversation,
} from './chat-attachments-test-doubles';
import {
  makeJpeg,
  makePdf,
  makePng,
  makeWebp,
  TEXT_FILE,
} from './attachment-test-fixtures';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import {
  ATTACHMENT_DEFAULTS,
  ATTACHMENT_ERRORS,
} from './chat-attachments.constants';
import { ChatAttachmentsService } from './chat-attachments.service';
import { LocalDiskAttachmentStorage } from './local-disk-attachment.storage';

type Enabled = Extract<ChatAttachmentsConfig, { enabled: true }>;

const enabledConfig = (overrides: Partial<Enabled> = {}): Enabled => ({
  enabled: true,
  storageDir: '/unused',
  ...ATTACHMENT_DEFAULTS,
  minFreeBytes: 0,
  ...overrides,
});

describe('ChatAttachmentsService (no database: in-memory repository, real disk in a temp dir)', () => {
  let root: string;
  let storage: LocalDiskAttachmentStorage;
  let repo: FakeAttachmentsRepository;

  const build = (
    config: ChatAttachmentsConfig = enabledConfig({ storageDir: root }),
    conversations = [directConversation(), teamConversation()],
  ) => {
    const chatRepo = makeChatRepositoryStub(conversations);
    const { chat, eligibility } = makeRealChat(chatRepo);
    const service = new ChatAttachmentsService(
      config,
      config.enabled ? storage : null,
      repo,
      eligibility,
      chat,
    );

    return { service, chatRepo };
  };

  /** Simulates what the upload engine does: a finished temp file. */
  async function receive(
    service: ChatAttachmentsService,
    content: Buffer,
    options: { user?: string; conversation?: string; name?: string } = {},
  ) {
    const permit = await service.preflightUpload(
      options.user ?? 'u1',
      options.conversation ?? 'dm-1',
    );

    await writeFile(permit.tempPath, content);

    const file = {
      path: permit.tempPath,
      size: content.length,
      sha256: 'f'.repeat(64),
      originalname: options.name ?? 'photo.png',
    };

    return { permit, file };
  }

  async function filesUnder(dir: string): Promise<string[]> {
    const out: string[] = [];

    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await filesUnder(path)));
      else out.push(path);
    }

    return out;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orbit-att-svc-'));
    storage = new LocalDiskAttachmentStorage(root);
    repo = new FakeAttachmentsRepository();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------
  describe('feature switch', () => {
    it('is off: every operation answers 404 and nothing touches the disk', async () => {
      const { service } = build({ enabled: false, reason: 'flag_off' });

      await expect(
        service.preflightUpload('u1', 'dm-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.download('u1', 'dm-1', 'a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.cancel('u1', 'dm-1', 'a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await readdir(root)).toEqual([]);
    });

    it('reports the limits to an eligible client only when enabled', async () => {
      const on = build();
      await expect(on.service.getClientConfig('u1')).resolves.toMatchObject({
        enabled: true,
        imageMaxBytes: 5 * 1024 * 1024,
        pdfMaxBytes: 10 * 1024 * 1024,
      });

      const off = build({ enabled: false, reason: 'flag_off' });
      await expect(off.service.getClientConfig('u1')).resolves.toEqual({
        enabled: false,
      });
    });

    it('refuses the config to an ineligible caller (existing eligibility check)', async () => {
      const { service, chatRepo } = build();
      chatRepo.findActor.mockResolvedValueOnce(null as never);

      await expect(service.getClientConfig('ghost')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------
  describe('authorization is the existing chat access path', () => {
    it('a non-participant gets the uniform 404 before any space or slot is used', async () => {
      const { service, chatRepo } = build();
      chatRepo.isParticipant.mockResolvedValue(false);

      await expect(
        service.preflightUpload('u1', 'dm-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await readdir(root)).toEqual([]);
      expect(await repo.countPendingForUser('u1', COMPANY)).toBe(0);
    });

    it("someone who is not one of the pair cannot upload into the pair's conversation", async () => {
      const { service } = build();

      await expect(
        service.preflightUpload('u3', 'dm-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a conversation of another company is a 404 (tenant isolation)', async () => {
      const { service } = build(undefined, [
        directConversation({ id: 'dm-x', companyId: OTHER_COMPANY }),
      ]);

      await expect(
        service.preflightUpload('u1', 'dm-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('attachments are for direct conversations only', async () => {
      const { service } = build();

      await expect(service.preflightUpload('u1', 'team-1')).rejects.toThrow(
        ATTACHMENT_ERRORS.directOnly,
      );
    });
  });

  // -------------------------------------------------------------------
  describe('limits before a byte is accepted (preflight)', () => {
    it('refuses when the user already has the maximum pending uploads', async () => {
      for (let i = 0; i < 3; i += 1) {
        repo.add(
          attachmentRow({ id: `p${i}`, storageKey: `${COMPANY}/aa/p${i}` }),
        );
      }

      const { service } = build();

      await expect(service.preflightUpload('u1', 'dm-1')).rejects.toMatchObject(
        {
          status: 429,
          message: ATTACHMENT_ERRORS.quotaPending,
        },
      );
    });

    it('does not count expired or other users/companies against the pending limit', async () => {
      repo.add(attachmentRow({ id: 'e1', status: 'EXPIRED' }));
      repo.add(attachmentRow({ id: 'o1', uploaderKey: 'u2' }));
      repo.add(attachmentRow({ id: 'c1', companyId: OTHER_COMPANY }));

      const { service } = build();
      const permit = await service.preflightUpload('u1', 'dm-1');
      permit.release();
      expect(permit.tempPath.endsWith('.part')).toBe(true);
    });

    it('refuses when the daily upload limit is reached', async () => {
      for (let i = 0; i < 30; i += 1) {
        repo.add(
          attachmentRow({
            id: `d${i}`,
            status: 'EXPIRED',
            storageKey: `${COMPANY}/aa/d${i}`,
          }),
        );
      }

      const { service } = build();

      await expect(service.preflightUpload('u1', 'dm-1')).rejects.toMatchObject(
        {
          status: 429,
          message: ATTACHMENT_ERRORS.quotaDaily,
        },
      );
    });

    it('refuses when the company storage quota is used up (507)', async () => {
      repo.add(
        attachmentRow({
          status: 'ATTACHED',
          messageId: 'm1',
          sizeBytes: 600,
          expiresAt: null,
        }),
      );

      const { service } = build(
        enabledConfig({ storageDir: root, companyQuotaBytes: 500 }),
      );

      await expect(service.preflightUpload('u1', 'dm-1')).rejects.toMatchObject(
        {
          status: 507,
          message: ATTACHMENT_ERRORS.quotaCompany,
        },
      );
    });

    it("another company's usage does not consume this company's quota", async () => {
      repo.add(
        attachmentRow({
          id: 'big',
          companyId: OTHER_COMPANY,
          status: 'ATTACHED',
          messageId: 'm9',
          sizeBytes: 10_000,
          expiresAt: null,
          storageKey: `${OTHER_COMPANY}/aa/big`,
        }),
      );

      const { service } = build(
        enabledConfig({ storageDir: root, companyQuotaBytes: 500 }),
      );
      const permit = await service.preflightUpload('u1', 'dm-1');
      permit.release();
    });

    it('stops safely when the volume has too little free space (503)', async () => {
      const { service } = build(
        enabledConfig({
          storageDir: root,
          minFreeBytes: Number.MAX_SAFE_INTEGER / 2,
        }),
      );

      await expect(
        service.preflightUpload('u1', 'dm-1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('bounds simultaneous uploads per user and releases the slot on any outcome', async () => {
      const { service } = build();

      const first = await service.preflightUpload('u1', 'dm-1');
      const second = await service.preflightUpload('u1', 'dm-1');

      await expect(service.preflightUpload('u1', 'dm-1')).rejects.toMatchObject(
        {
          status: 429,
          message: ATTACHMENT_ERRORS.busy,
        },
      );

      first.release();
      first.release(); // idempotent: must not free a second slot

      const third = await service.preflightUpload('u1', 'dm-1');
      await expect(
        service.preflightUpload('u1', 'dm-1'),
      ).rejects.toBeInstanceOf(HttpException);

      second.release();
      third.release();
    });

    it('bounds simultaneous uploads overall', async () => {
      const { service } = build(
        enabledConfig({ storageDir: root, maxConcurrentUploads: 2 }),
      );

      const a = await service.preflightUpload('u1', 'dm-1');
      const b = await service.preflightUpload('u2', 'dm-1');

      await expect(service.preflightUpload('u1', 'dm-1')).rejects.toMatchObject(
        {
          message: ATTACHMENT_ERRORS.busy,
        },
      );

      a.release();
      b.release();
    });

    it('releases the slot when the preflight itself fails', async () => {
      repo.add(attachmentRow({ id: 'p0', storageKey: `${COMPANY}/aa/p0` }));
      repo.add(attachmentRow({ id: 'p1', storageKey: `${COMPANY}/aa/p1` }));
      repo.add(attachmentRow({ id: 'p2', storageKey: `${COMPANY}/aa/p2` }));

      const { service } = build();

      for (let i = 0; i < 5; i += 1) {
        await expect(
          service.preflightUpload('u1', 'dm-1'),
        ).rejects.toMatchObject({
          message: ATTACHMENT_ERRORS.quotaPending,
        });
      }
    });
  });

  // -------------------------------------------------------------------
  describe('completeUpload: content is validated, never the client', () => {
    it.each([
      ['PNG', makePng(), 'image/png', 'photo.png'],
      ['JPEG', makeJpeg(), 'image/jpeg', 'photo.jpg'],
      ['WebP', makeWebp(), 'image/webp', 'photo.webp'],
      ['PDF', makePdf(), 'application/pdf', 'report.pdf'],
    ])(
      'stores a valid %s as READY under the caller company',
      async (_n, content, type, name) => {
        const { service } = build();
        const { permit, file } = await receive(service, content, { name });

        const result = await service.completeUpload(permit, file);
        permit.release();

        expect(result.attachment).toMatchObject({
          contentType: type,
          sizeBytes: content.length,
        });
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(
          Date.now(),
        );

        const row = repo.rows.get(result.attachment.id)!;
        expect(row.status).toBe('READY');
        expect(row.companyId).toBe(COMPANY);
        expect(row.uploaderKey).toBe('u1');
        expect(row.conversationId).toBe('dm-1');
        // random internal key under the company, never the original name
        expect(row.storageKey.startsWith(`${COMPANY}/`)).toBe(true);
        expect(row.storageKey).not.toContain(name.split('.')[0]);

        const stored = await stat(join(root, ...row.storageKey.split('/')));
        expect(stored.size).toBe(content.length);

        // no temporary file left
        expect(
          (await filesUnder(root)).filter((p) => p.endsWith('.part')),
        ).toEqual([]);
      },
    );

    it('ignores a lying name/MIME: a PDF named .png is stored (and named) as a PDF', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePdf(), {
        name: 'fake.png',
      });

      const result = await service.completeUpload(permit, file);
      permit.release();

      expect(result.attachment.contentType).toBe('application/pdf');
      expect(result.attachment.displayName).toBe('fake.pdf');
    });

    it('rejects a file that is not an allowed type and leaves nothing behind', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, TEXT_FILE, {
        name: 'a.png',
      });

      await expect(service.completeUpload(permit, file)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      permit.release();

      expect(repo.rows.size).toBe(0);
      expect(await filesUnder(root)).toEqual([]);
    });

    it('rejects a corrupt image, an oversized image and an oversized PDF', async () => {
      // A truncated image is "corrupt" (default limits: the size check passes).
      const normal = build(enabledConfig({ storageDir: root }));
      const png = makePng();
      const corrupt = await receive(
        normal.service,
        png.subarray(0, png.length - 4),
      );
      await expect(
        normal.service.completeUpload(corrupt.permit, corrupt.file),
      ).rejects.toBeInstanceOf(BadRequestException);
      corrupt.permit.release();

      // Tiny limits: any realistic image / PDF is "too large".
      const { service } = build(
        enabledConfig({ storageDir: root, imageMaxBytes: 50, pdfMaxBytes: 60 }),
      );

      const big = await receive(service, makePng(4, 3));
      await expect(
        service.completeUpload(big.permit, big.file),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      big.permit.release();

      const bigPdf = await receive(service, makePdf('x'.repeat(200)));
      await expect(
        service.completeUpload(bigPdf.permit, bigPdf.file),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      bigPdf.permit.release();

      expect(repo.rows.size).toBe(0);
      expect(await filesUnder(root)).toEqual([]);
    });

    it('rejects an image beyond the dimension limit', async () => {
      const { service } = build(
        enabledConfig({ storageDir: root, maxImageDimension: 100 }),
      );
      const { permit, file } = await receive(service, makePng(500, 10));

      await expect(service.completeUpload(permit, file)).rejects.toThrow(
        ATTACHMENT_ERRORS.dimensions,
      );
      permit.release();
    });

    it('rejects an encrypted PDF and a PDF with active content', async () => {
      const { service } = build();

      for (const [content, message] of [
        [makePdf('<< /Encrypt 1 0 R >>'), ATTACHMENT_ERRORS.pdfEncrypted],
        [makePdf('<< /JavaScript (x) >>'), ATTACHMENT_ERRORS.pdfActiveContent],
      ] as const) {
        const { permit, file } = await receive(service, content);
        await expect(service.completeUpload(permit, file)).rejects.toThrow(
          message,
        );
        permit.release();
      }

      expect(repo.rows.size).toBe(0);
    });

    it('refuses a result that does not belong to this permit (path / size mismatch)', async () => {
      const { service } = build();

      // A failed completion removes the temporary file, so every case gets
      // its own upload.
      const wrongPath = await receive(service, makePng());
      await expect(
        service.completeUpload(wrongPath.permit, {
          ...wrongPath.file,
          path: '/etc/passwd',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      wrongPath.permit.release();

      const wrongSize = await receive(service, makePng());
      await expect(
        service.completeUpload(wrongSize.permit, {
          ...wrongSize.file,
          size: (wrongSize.file.size as number) + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      wrongSize.permit.release();

      const empty = await receive(service, makePng());
      await expect(
        service.completeUpload(empty.permit, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      empty.permit.release();

      expect(repo.rows.size).toBe(0);
    });

    it('enforces the company quota on the authoritative reserve and cleans up', async () => {
      const { service } = build(
        enabledConfig({ storageDir: root, companyQuotaBytes: 40 }),
      );
      const { permit, file } = await receive(service, makePng());

      await expect(service.completeUpload(permit, file)).rejects.toMatchObject({
        status: 507,
      });
      permit.release();

      expect(repo.rows.size).toBe(0);
      expect(await filesUnder(root)).toEqual([]);
    });

    it('expires the row and removes the file when the row cannot become READY (sweeper won the race)', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePng());
      repo.failMarkReady = true;

      await expect(service.completeUpload(permit, file)).rejects.toBeInstanceOf(
        ConflictException,
      );
      permit.release();

      const [row] = [...repo.rows.values()];
      expect(row.status).toBe('EXPIRED');
      expect(await filesUnder(root)).toEqual([]);
    });

    it('a failing move to the final key (atomic-rename failure) expires the row and leaves no file', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePng());
      jest
        .spyOn(storage, 'commit')
        .mockRejectedValueOnce(new Error('EXDEV simulated'));

      await expect(service.completeUpload(permit, file)).rejects.toBeInstanceOf(
        Error,
      );
      permit.release();

      expect([...repo.rows.values()].every((r) => r.status === 'EXPIRED')).toBe(
        true,
      );
      expect(await filesUnder(root)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  describe('download goes through the existing conversation access check', () => {
    async function attached(content = makePng()) {
      const { service } = build();
      const { permit, file } = await receive(service, content);
      const result = await service.completeUpload(permit, file);
      permit.release();

      const row = repo.rows.get(result.attachment.id)!;
      repo.rows.set(row.id, {
        ...row,
        status: 'ATTACHED',
        messageId: 'm1',
        attachedAt: new Date(),
        expiresAt: null,
      });

      return { service, id: row.id, content };
    }

    it('streams an attached file to a participant', async () => {
      const { service, id, content } = await attached();

      const { row, opened } = await service.download('u2', 'dm-1', id);
      const chunks: Buffer[] = [];
      for await (const chunk of opened.stream) chunks.push(chunk as Buffer);

      expect(row.id).toBe(id);
      expect(Buffer.concat(chunks).equals(content)).toBe(true);
    });

    it('refuses a non-participant even with a valid attachment id', async () => {
      const { service, id } = await attached();

      await expect(service.download('u3', 'dm-1', id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses the attachment through a different conversation of the same user', async () => {
      const { id } = await attached();
      const { service } = build(undefined, [
        directConversation(),
        directConversation({ id: 'dm-2', directUserHighKey: 'u3' }),
      ]);

      await expect(service.download('u1', 'dm-2', id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses an attachment of another company, whoever asks', async () => {
      repo.add(
        attachmentRow({
          id: 'foreign',
          companyId: OTHER_COMPANY,
          conversationId: 'dm-1',
          status: 'ATTACHED',
          messageId: 'mx',
          expiresAt: null,
          storageKey: `${OTHER_COMPANY}/aa/foreign`,
        }),
      );
      const { service } = build();

      await expect(
        service.download('u1', 'dm-1', 'foreign'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not serve a file that was uploaded but never sent', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePng());
      const result = await service.completeUpload(permit, file);
      permit.release();

      await expect(
        service.download('u1', 'dm-1', result.attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 503 (not a stack trace) when the file is missing on disk', async () => {
      const { service, id } = await attached();
      const row = repo.rows.get(id)!;
      await rm(join(root, ...row.storageKey.split('/')));

      await expect(service.download('u1', 'dm-1', id)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('refuses a file whose size on disk no longer matches the record', async () => {
      const { service, id } = await attached();
      const row = repo.rows.get(id)!;
      repo.rows.set(id, { ...row, sizeBytes: row.sizeBytes + 1 });

      await expect(service.download('u1', 'dm-1', id)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  // -------------------------------------------------------------------
  describe('cancel', () => {
    it('lets the uploader discard an unsent attachment and removes its file', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePng());
      const result = await service.completeUpload(permit, file);
      permit.release();

      await expect(
        service.cancel('u1', 'dm-1', result.attachment.id),
      ).resolves.toEqual({
        cancelled: true,
      });

      expect(repo.rows.get(result.attachment.id)!.status).toBe('EXPIRED');
      expect(await filesUnder(root)).toEqual([]);
    });

    it('can never remove the file of an attachment that was sent', async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePng());
      const result = await service.completeUpload(permit, file);
      permit.release();

      const row = repo.rows.get(result.attachment.id)!;
      repo.rows.set(row.id, {
        ...row,
        status: 'ATTACHED',
        messageId: 'm1',
        expiresAt: null,
      });

      await expect(service.cancel('u1', 'dm-1', row.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect((await filesUnder(root)).length).toBe(1);
      expect(repo.rows.get(row.id)!.status).toBe('ATTACHED');
    });

    it("cannot cancel someone else's attachment", async () => {
      const { service } = build();
      const { permit, file } = await receive(service, makePng());
      const result = await service.completeUpload(permit, file);
      permit.release();

      await expect(
        service.cancel('u2', 'dm-1', result.attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.rows.get(result.attachment.id)!.status).toBe('READY');
    });
  });
});
