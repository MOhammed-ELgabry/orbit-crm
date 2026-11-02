import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  attachmentRow,
  COMPANY,
  FakeAttachmentsRepository,
} from './chat-attachments-test-doubles';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import { ATTACHMENT_DEFAULTS } from './chat-attachments.constants';
import { ChatAttachmentsSweeper } from './chat-attachments.sweeper';
import { LocalDiskAttachmentStorage } from './local-disk-attachment.storage';

const HOUR = 3_600_000;

describe('ChatAttachmentsSweeper (in-memory rows, real temp-dir files)', () => {
  let root: string;
  let storage: LocalDiskAttachmentStorage;
  let repo: FakeAttachmentsRepository;

  const config = (
    overrides: Record<string, unknown> = {},
  ): ChatAttachmentsConfig =>
    ({
      enabled: true,
      storageDir: root,
      ...ATTACHMENT_DEFAULTS,
      ...overrides,
    }) as ChatAttachmentsConfig;

  const put = async (key: string) => {
    await storage.ensureReady();
    const temp = storage.createTempPath();
    await writeFile(temp, 'x');
    await storage.commit(temp, key);
  };

  const exists = (key: string) =>
    stat(join(root, ...key.split('/'))).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orbit-att-sweep-'));
    storage = new LocalDiskAttachmentStorage(root);
    repo = new FakeAttachmentsRepository();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('expires overdue unsent attachments and removes their files', async () => {
    await put(`${COMPANY}/aa/old`);
    repo.add(
      attachmentRow({
        id: 'old',
        storageKey: `${COMPANY}/aa/old`,
        expiresAt: new Date(Date.now() - HOUR),
      }),
    );

    const sweeper = new ChatAttachmentsSweeper(config(), storage, repo);
    const summary = await sweeper.runOnce();

    expect(summary.expired).toBe(1);
    expect(repo.rows.get('old')!.status).toBe('EXPIRED');
    expect(await exists(`${COMPANY}/aa/old`)).toBe(false);
  });

  it('never touches an ATTACHED attachment or its file, however old', async () => {
    await put(`${COMPANY}/aa/sent`);
    repo.add(
      attachmentRow({
        id: 'sent',
        status: 'ATTACHED',
        messageId: 'm1',
        storageKey: `${COMPANY}/aa/sent`,
        expiresAt: null,
        createdAt: new Date(Date.now() - 400 * 24 * HOUR),
      }),
    );

    const sweeper = new ChatAttachmentsSweeper(config(), storage, repo);
    await sweeper.runOnce();
    await sweeper.runOnce();

    expect(repo.rows.get('sent')!.status).toBe('ATTACHED');
    expect(await exists(`${COMPANY}/aa/sent`)).toBe(true);
  });

  it('keeps unsent attachments that are still valid', async () => {
    await put(`${COMPANY}/aa/live`);
    repo.add(attachmentRow({ id: 'live', storageKey: `${COMPANY}/aa/live` }));

    await new ChatAttachmentsSweeper(config(), storage, repo).runOnce();

    expect(repo.rows.get('live')!.status).toBe('READY');
    expect(await exists(`${COMPANY}/aa/live`)).toBe(true);
  });

  it('deletes old EXPIRED rows only after their file is gone', async () => {
    repo.add(
      attachmentRow({
        id: 'gone',
        status: 'EXPIRED',
        storageKey: `${COMPANY}/aa/gone`,
        expiresAt: new Date(Date.now() - 72 * HOUR),
      }),
    );

    const summary = await new ChatAttachmentsSweeper(
      config(),
      storage,
      repo,
    ).runOnce();

    expect(summary.rowsDeleted).toBe(1);
    expect(repo.rows.has('gone')).toBe(false);
  });

  it('keeps the row (to retry) when its file cannot be removed', async () => {
    repo.add(
      attachmentRow({
        id: 'stuck',
        status: 'EXPIRED',
        storageKey: `${COMPANY}/aa/stuck`,
        expiresAt: new Date(Date.now() - 72 * HOUR),
      }),
    );
    jest.spyOn(storage, 'remove').mockRejectedValue(new Error('EBUSY'));

    const summary = await new ChatAttachmentsSweeper(
      config(),
      storage,
      repo,
    ).runOnce();

    expect(summary.failures).toBeGreaterThan(0);
    expect(repo.rows.has('stuck')).toBe(true);
  });

  it('removes stale temporary files of interrupted uploads', async () => {
    await storage.ensureReady();
    const stale = storage.createTempPath();
    await writeFile(stale, 'x');
    const old = new Date(Date.now() - 3 * HOUR);
    await utimes(stale, old, old);

    const summary = await new ChatAttachmentsSweeper(
      config(),
      storage,
      repo,
    ).runOnce();

    expect(summary.tempFiles).toBe(1);
  });

  it('does a bounded amount of work per run', async () => {
    for (let i = 0; i < 10; i += 1) {
      repo.add(
        attachmentRow({
          id: `o${i}`,
          storageKey: `${COMPANY}/aa/o${i}`,
          expiresAt: new Date(Date.now() - HOUR),
        }),
      );
    }

    const sweeper = new ChatAttachmentsSweeper(
      config({ sweepBatchSize: 4 }),
      storage,
      repo,
    );

    expect((await sweeper.runOnce()).expired).toBe(4);
    expect((await sweeper.runOnce()).expired).toBe(4);
    expect((await sweeper.runOnce()).expired).toBe(2);
  });

  it('does nothing (and touches no storage) when the feature is off', async () => {
    const sweeper = new ChatAttachmentsSweeper(
      { enabled: false, reason: 'flag_off' },
      null,
      repo,
    );
    const claim = jest.spyOn(repo, 'claimExpired');

    expect(await sweeper.runOnce()).toEqual({
      expired: 0,
      tempFiles: 0,
      rowsDeleted: 0,
      failures: 0,
    });
    expect(claim).not.toHaveBeenCalled();
  });

  describe('in-process timer (NODE_ENV is "test" under jest, so it is switched for these cases)', () => {
    const previous = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = previous;
      jest.restoreAllMocks();
    });

    it('does not start a timer when the feature is off or the interval is 0', () => {
      const spy = jest.spyOn(global, 'setInterval');

      new ChatAttachmentsSweeper(
        { enabled: false, reason: 'flag_off' },
        null,
        repo,
      ).onModuleInit();
      new ChatAttachmentsSweeper(
        config({ sweepIntervalMs: 0 }),
        storage,
        repo,
      ).onModuleInit();

      expect(spy).not.toHaveBeenCalled();
    });

    it('starts one unref-ed timer when enabled, and stops it on shutdown', () => {
      const unref = jest.fn();
      const timer = { unref } as unknown as NodeJS.Timeout;
      const set = jest.spyOn(global, 'setInterval').mockReturnValue(timer);
      const clear = jest.spyOn(global, 'clearInterval').mockImplementation();

      const sweeper = new ChatAttachmentsSweeper(config(), storage, repo);
      sweeper.onModuleInit();
      sweeper.onModuleDestroy();

      expect(set).toHaveBeenCalledTimes(1);
      expect(unref).toHaveBeenCalled();
      expect(clear).toHaveBeenCalledWith(timer);
    });
  });

  it('never runs two sweeps at once', async () => {
    const sweeper = new ChatAttachmentsSweeper(config(), storage, repo);
    const claim = jest.spyOn(repo, 'claimExpired');

    await Promise.all([sweeper.runOnce(), sweeper.runOnce()]);

    expect(claim).toHaveBeenCalledTimes(1);
  });
});
