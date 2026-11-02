import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AttachmentFileMissingError,
  AttachmentStorageUnavailableError,
} from './attachment-storage.interface';
import { LocalDiskAttachmentStorage } from './local-disk-attachment.storage';

describe('LocalDiskAttachmentStorage (real disk, temp directory only)', () => {
  let root: string;
  let storage: LocalDiskAttachmentStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orbit-att-store-'));
    storage = new LocalDiskAttachmentStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const tempFile = async (content: string) => {
    await storage.ensureReady();
    const path = storage.createTempPath();
    await writeFile(path, content);
    return path;
  };

  it('never creates the root itself: a missing root is "unavailable"', async () => {
    const missing = new LocalDiskAttachmentStorage(
      join(root, 'does-not-exist'),
    );

    await expect(missing.ensureReady()).rejects.toBeInstanceOf(
      AttachmentStorageUnavailableError,
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('creates only its temporary area inside an existing root', async () => {
    await storage.ensureReady();
    expect(await readdir(root)).toEqual(['.tmp']);
  });

  it('uses restrictive permissions for folders and files (POSIX)', async () => {
    if (process.platform === 'win32') return;

    const temp = await tempFile('x');
    await storage.commit(temp, 'co/ab/file1');

    expect((await stat(join(root, 'co'))).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, 'co', 'ab'))).mode & 0o777).toBe(0o700);
  });

  it('commits atomically: the final file has the content, the temp name is gone', async () => {
    const temp = await tempFile('hello');
    await storage.commit(temp, 'co/ab/file1');

    expect(await readFile(join(root, 'co', 'ab', 'file1'), 'utf8')).toBe(
      'hello',
    );
    await expect(stat(temp)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never overwrites an existing file', async () => {
    await storage.commit(await tempFile('first'), 'co/ab/file1');

    await expect(
      storage.commit(await tempFile('second'), 'co/ab/file1'),
    ).rejects.toBeInstanceOf(AttachmentStorageUnavailableError);

    expect(await readFile(join(root, 'co', 'ab', 'file1'), 'utf8')).toBe(
      'first',
    );
  });

  describe('path traversal and unsafe keys', () => {
    it.each([
      '../escape',
      'co/../../escape',
      'co/ab/../../../escape',
      '/etc/passwd',
      'co//file',
      'co/ab/file.txt',
      'co/ab/.hidden',
      'co',
      'a/b/c/d/e',
      'co/ab/fi le',
      'co\\ab\\file',
      'co/ab/%2e%2e',
      '',
    ])('refuses the key %p everywhere', async (key) => {
      const temp = await tempFile('x');

      await expect(storage.commit(temp, key)).rejects.toThrow();
      await expect(storage.open(key)).rejects.toBeInstanceOf(
        AttachmentFileMissingError,
      );
      await expect(storage.remove(key)).rejects.toBeInstanceOf(
        AttachmentFileMissingError,
      );
    });

    it('only accepts temporary paths inside its own .tmp folder', async () => {
      await storage.ensureReady();
      const outside = join(root, 'co-file.part');
      await writeFile(outside, 'x');

      await expect(storage.discardTemp(outside)).rejects.toThrow();
      await expect(storage.openTempReader(outside)).rejects.toThrow();
      await expect(storage.commit(outside, 'co/ab/f')).rejects.toThrow();
      expect(await readFile(outside, 'utf8')).toBe('x');
    });
  });

  it('opens a stored file with its size taken from the open handle', async () => {
    await storage.commit(await tempFile('abcdef'), 'co/ab/file1');

    const opened = await storage.open('co/ab/file1');
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) chunks.push(chunk as Buffer);

    expect(opened.size).toBe(6);
    expect(Buffer.concat(chunks).toString()).toBe('abcdef');
  });

  it('reports a missing file as such, and deleting a missing file is not an error', async () => {
    await expect(storage.open('co/ab/missing')).rejects.toBeInstanceOf(
      AttachmentFileMissingError,
    );
    await expect(storage.remove('co/ab/missing')).resolves.toBeUndefined();
    await storage.ensureReady();
    await expect(
      storage.discardTemp(storage.createTempPath()),
    ).resolves.toBeUndefined();
  });

  it('provides a positional reader over a temp file (no whole-file read)', async () => {
    const temp = await tempFile('0123456789');
    const { reader, close } = await storage.openTempReader(temp);

    expect(reader.size).toBe(10);
    expect((await reader.read(3, 4)).toString()).toBe('3456');
    expect((await reader.read(8, 10)).toString()).toBe('89');
    await close();
  });

  describe('sweepTemp (bounded)', () => {
    it('removes only stale .part files and respects the entry limit', async () => {
      await storage.ensureReady();

      const stale: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const path = storage.createTempPath();
        await writeFile(path, 'x');
        await utimes(
          path,
          new Date(Date.now() - 3 * 3600_000),
          new Date(Date.now() - 3 * 3600_000),
        );
        stale.push(path);
      }
      const fresh = storage.createTempPath();
      await writeFile(fresh, 'x');

      expect(await storage.sweepTemp(3600_000, 2)).toBeLessThanOrEqual(2);
      expect(await storage.sweepTemp(3600_000, 100)).toBeGreaterThanOrEqual(0);

      await expect(stat(fresh)).resolves.toBeDefined();
      for (const path of stale) {
        await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    });

    it('never touches final files', async () => {
      await storage.commit(await tempFile('keep'), 'co/ab/file1');
      await storage.sweepTemp(0, 100);

      expect(await readFile(join(root, 'co', 'ab', 'file1'), 'utf8')).toBe(
        'keep',
      );
    });
  });
});
