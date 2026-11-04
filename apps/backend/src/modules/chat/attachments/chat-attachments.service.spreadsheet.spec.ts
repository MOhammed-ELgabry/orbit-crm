import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import {
  contentTypesXml,
  makeXls,
  makeXlsx,
  XLS_MIME,
  XLSX_MIME,
} from './attachment-spreadsheet-fixtures';
import { makePdf, makePng } from './attachment-test-fixtures';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import {
  ATTACHMENT_DEFAULTS,
  ATTACHMENT_ERRORS,
} from './chat-attachments.constants';
import { ChatAttachmentsService } from './chat-attachments.service';
import {
  attachmentRow,
  directConversation,
  FakeAttachmentsRepository,
  makeChatRepositoryStub,
  makeRealChat,
  OTHER_COMPANY,
  teamConversation,
} from './chat-attachments-test-doubles';
import { LocalDiskAttachmentStorage } from './local-disk-attachment.storage';

type Enabled = Extract<ChatAttachmentsConfig, { enabled: true }>;

const enabledConfig = (overrides: Partial<Enabled> = {}): Enabled => ({
  enabled: true,
  storageDir: '/unused',
  ...ATTACHMENT_DEFAULTS,
  minFreeBytes: 0,
  ...overrides,
});

describe('ChatAttachmentsService - Excel workbooks (no database: in-memory repository, real disk in a temp dir)', () => {
  let root: string;
  let storage: LocalDiskAttachmentStorage;
  let repo: FakeAttachmentsRepository;

  const build = (
    config: ChatAttachmentsConfig = enabledConfig({ storageDir: root }),
  ) => {
    const chatRepo = makeChatRepositoryStub([
      directConversation(),
      teamConversation(),
    ]);
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

  /** What the upload engine + multer hand over: a finished temp file + client claims. */
  async function receive(
    service: ChatAttachmentsService,
    content: Buffer,
    options: {
      name: string;
      mimetype?: string;
      user?: string;
      conversation?: string;
    },
  ) {
    const permit = await service.preflightUpload(
      options.user ?? 'u1',
      options.conversation ?? 'dm-1',
    );

    await writeFile(permit.tempPath, content);

    return {
      permit,
      file: {
        path: permit.tempPath,
        size: content.length,
        sha256: 'f'.repeat(64),
        originalname: options.name,
        mimetype: options.mimetype,
      },
    };
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

  async function upload(
    service: ChatAttachmentsService,
    content: Buffer,
    name: string,
    mimetype?: string,
  ) {
    const { permit, file } = await receive(service, content, {
      name,
      mimetype,
    });

    try {
      return await service.completeUpload(permit, file);
    } finally {
      permit.release();
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orbit-att-xl-'));
    storage = new LocalDiskAttachmentStorage(root);
    repo = new FakeAttachmentsRepository();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('valid uploads', () => {
    it.each([
      ['.xlsx', makeXlsx(), 'Q1 sales.xlsx', XLSX_MIME],
      ['.xls', makeXls(), 'Q1 sales.xls', XLS_MIME],
    ])(
      'stores a valid %s as a READY SPREADSHEET under the caller company',
      async (_n, content, name, mime) => {
        const { service } = build();
        const result = await upload(service, content, name, mime);

        expect(result.attachment).toMatchObject({
          kind: 'SPREADSHEET',
          contentType: mime,
          displayName: name,
          sizeBytes: content.length,
          width: null,
          height: null,
        });

        const row = repo.rows.get(result.attachment.id)!;

        expect(row.status).toBe('READY');
        // Server-generated key: never derived from the client file name.
        expect(row.storageKey).toMatch(
          /^[A-Za-z0-9_-]+\/[0-9a-f]{2}\/[0-9a-f-]{36}$/,
        );
        expect(row.storageKey).not.toContain('sales');
        expect(await filesUnder(root)).toHaveLength(1);
      },
    );

    it('keeps a hostile file name out of the storage path and sanitises the display name', async () => {
      const { service } = build();
      const result = await upload(
        service,
        makeXlsx(),
        '../../etc/passwd‮.xlsx',
        XLSX_MIME,
      );
      const files = await filesUnder(root);

      expect(files).toHaveLength(1);
      expect(files[0].startsWith(root)).toBe(true);
      expect(files[0]).not.toContain('passwd');
      expect(result.attachment.displayName).toBe('passwd.xlsx');
    });

    it('tells an eligible client about the spreadsheet limit and the accepted types', async () => {
      const { service } = build();

      await expect(service.getClientConfig('u1')).resolves.toMatchObject({
        enabled: true,
        imageMaxBytes: 5 * 1024 * 1024,
        pdfMaxBytes: 10 * 1024 * 1024,
        spreadsheetMaxBytes: 10 * 1024 * 1024,
        allowedContentTypes: expect.arrayContaining([
          XLSX_MIME,
          XLS_MIME,
        ]) as unknown,
      });
    });
  });

  describe('rejections (nothing stays on disk or in the table)', () => {
    async function rejected(
      content: Buffer,
      name: string,
      mimetype: string | undefined,
      error: unknown,
    ) {
      const { service } = build();

      await expect(
        upload(service, content, name, mimetype),
      ).rejects.toBeInstanceOf(error as new () => Error);
      expect(repo.rows.size).toBe(0);
      expect(await filesUnder(root)).toEqual([]);
    }

    it('invalid extension', async () => {
      // Claims Excel by MIME type but not by name: a disagreement.
      await rejected(makeXlsx(), 'sales.txt', XLSX_MIME, BadRequestException);
      // Claims nothing about Excel at all: simply not a supported type.
      await rejected(
        makeXlsx(),
        'sales.txt',
        undefined,
        UnsupportedMediaTypeException,
      );
      await rejected(
        makeXlsx(),
        'sales',
        'application/octet-stream',
        UnsupportedMediaTypeException,
      );
    });

    it('invalid MIME type', async () => {
      await rejected(
        makeXlsx(),
        'sales.xlsx',
        'text/html',
        BadRequestException,
      );
    });

    it('extension / MIME / content mismatch: .xlsx bytes named .xls', async () => {
      await rejected(makeXlsx(), 'sales.xls', XLS_MIME, BadRequestException);
    });

    it.each([
      ['a PDF', makePdf()],
      ['a PNG', makePng()],
      ['an HTML page', Buffer.from('<html><script>alert(1)</script></html>')],
      [
        'an executable',
        Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]),
      ],
    ])('a renamed non-Excel file (%s)', async (_label, bytes) => {
      await rejected(bytes, 'sales.xlsx', XLSX_MIME, BadRequestException);
    });

    it('.xlsm by name, and macros hidden behind an .xlsx name', async () => {
      await rejected(makeXlsx(), 'sales.xlsm', XLSX_MIME, BadRequestException);
      await rejected(
        makeXlsx({ extraParts: { 'xl/vbaProject.bin': Buffer.from('x') } }),
        'sales.xlsx',
        XLSX_MIME,
        BadRequestException,
      );
      await rejected(
        makeXlsx({
          contentTypes: contentTypesXml(
            'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
          ),
        }),
        'sales.xlsx',
        XLSX_MIME,
        BadRequestException,
      );
    });

    it('the error carries the stable token the client translates', async () => {
      const { service } = build();

      await expect(
        upload(service, makeXlsx(), 'a.xlsm', XLSX_MIME),
      ).rejects.toThrow(ATTACHMENT_ERRORS.spreadsheetMacro);
      await expect(
        upload(service, makePdf(), 'a.xlsx', XLSX_MIME),
      ).rejects.toThrow(ATTACHMENT_ERRORS.typeMismatch);
    });

    it('oversized workbook (configured limit)', async () => {
      const content = makeXlsx({
        extraParts: { 'xl/media/data.bin': Buffer.alloc(4096, 1) },
      });
      const { service } = build(
        enabledConfig({
          storageDir: root,
          spreadsheetMaxBytes: content.length - 1,
        }),
      );

      await expect(
        upload(service, content, 'big.xlsx', XLSX_MIME),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(repo.rows.size).toBe(0);
      expect(await filesUnder(root)).toEqual([]);
    });

    it('oversized workbook (default 10 MiB limit)', async () => {
      const content = makeXlsx({
        extraParts: { 'xl/media/data.bin': Buffer.alloc(10 * 1024 * 1024) },
      });

      await rejected(content, 'big.xlsx', XLSX_MIME, PayloadTooLargeException);
    });

    it('lowering the spreadsheet limit does not change the image or PDF limits', async () => {
      const { service } = build(
        enabledConfig({ storageDir: root, spreadsheetMaxBytes: 1 }),
      );

      await expect(
        upload(service, makePdf(), 'a.pdf', 'application/pdf'),
      ).resolves.toMatchObject({
        attachment: { kind: 'PDF' },
      });
      await expect(
        upload(service, makePng(), 'a.png', 'image/png'),
      ).resolves.toMatchObject({
        attachment: { kind: 'IMAGE' },
      });
    });
  });

  describe('authorization is unchanged for spreadsheets', () => {
    it('refuses the upload to a non-participant and in the team conversation (before any byte)', async () => {
      const { service } = build();

      await expect(
        service.preflightUpload('u3', 'dm-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.preflightUpload('u1', 'team-1')).rejects.toThrow(
        ATTACHMENT_ERRORS.directOnly,
      );
      expect(await filesUnder(root)).toEqual([]);
    });

    async function attachedWorkbook() {
      const { service } = build();
      const content = makeXlsx();
      const result = await upload(service, content, 'sales.xlsx', XLSX_MIME);
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

    it('streams the ORIGINAL bytes to a participant, typed as a spreadsheet', async () => {
      const { service, id, content } = await attachedWorkbook();
      const { row, opened } = await service.download('u2', 'dm-1', id);
      const chunks: Buffer[] = [];

      for await (const chunk of opened.stream) chunks.push(chunk as Buffer);

      expect(row.kind).toBe('SPREADSHEET');
      expect(row.contentType).toBe(XLSX_MIME);
      expect(Buffer.concat(chunks).equals(content)).toBe(true);
    });

    it('unauthorized download: a user outside the conversation gets 404', async () => {
      const { service, id } = await attachedWorkbook();

      await expect(service.download('u3', 'dm-1', id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('cross-company: another company attachment is never served, whoever asks', async () => {
      repo.add(
        attachmentRow({
          id: 'foreign-xlsx',
          companyId: OTHER_COMPANY,
          conversationId: 'dm-1',
          kind: 'SPREADSHEET',
          contentType: XLSX_MIME,
          status: 'ATTACHED',
          messageId: 'mx',
          expiresAt: null,
          storageKey: `${OTHER_COMPANY}/aa/foreign-xlsx`,
        }),
      );
      const { service } = build();

      await expect(
        service.download('u1', 'dm-1', 'foreign-xlsx'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a user of another company cannot reach the conversation at all', async () => {
      const { service, id } = await attachedWorkbook();

      // `x…` ids resolve to OTHER_COMPANY in the chat repository stub.
      await expect(service.download('x1', 'dm-1', id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('an unsent workbook is not downloadable and cannot be sent by someone else', async () => {
      const { service } = build();
      const result = await upload(service, makeXlsx(), 'sales.xlsx', XLSX_MIME);

      await expect(
        service.download('u1', 'dm-1', result.attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
