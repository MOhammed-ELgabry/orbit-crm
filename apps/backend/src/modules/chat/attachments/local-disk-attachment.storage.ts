import { randomUUID } from 'node:crypto';
import { constants as fsConstants, type Dirent, type Stats } from 'node:fs';
import {
  access,
  copyFile,
  link,
  mkdir,
  open,
  opendir,
  stat,
  statfs,
  unlink,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import type { ByteReader } from './attachment-inspector';
import {
  AttachmentFileMissingError,
  AttachmentStorageUnavailableError,
  type AttachmentStorage,
  type OpenedAttachment,
  type TempReader,
} from './attachment-storage.interface';
import {
  STORAGE_SEGMENT_PATTERN,
  TEMP_DIR_NAME,
} from './chat-attachments.constants';

const DIR_MODE = 0o700;
const READY_CACHE_MS = 30_000;

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Local disk implementation of AttachmentStorage.
 *
 * Layout:  <root>/<companyId>/<aa>/<random>   final files (mode 0600)
 *          <root>/.tmp/<random>.part          uploads being received
 *
 * The root must already exist (created and permissioned by whoever deploys
 * the feature); only sub-directories inside it are created here, with mode
 * 0700. Writing happens in `.tmp` on the SAME volume, then `commit` links the
 * finished file to its key (link fails if the key exists, so nothing is ever
 * overwritten) and removes the temporary name.
 *
 * File CONTENT is never logged and never passed through any error message.
 */
export class LocalDiskAttachmentStorage implements AttachmentStorage {
  private readonly root: string;
  private readonly tempDir: string;
  private readyUntil = 0;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
    this.tempDir = join(this.root, TEMP_DIR_NAME);
  }

  async ensureReady(): Promise<void> {
    if (Date.now() < this.readyUntil) return;

    try {
      const info = await stat(this.root);

      if (!info.isDirectory()) throw new AttachmentStorageUnavailableError();

      await access(this.root, fsConstants.R_OK | fsConstants.W_OK);
      await mkdir(this.tempDir, { recursive: true, mode: DIR_MODE });
    } catch (error) {
      if (error instanceof AttachmentStorageUnavailableError) throw error;
      throw new AttachmentStorageUnavailableError();
    }

    this.readyUntil = Date.now() + READY_CACHE_MS;
  }

  createTempPath(): string {
    return join(this.tempDir, `${randomUUID()}.part`);
  }

  /**
   * Maps a storage key to an absolute path INSIDE the root, or throws. Every
   * segment must match [A-Za-z0-9_-]+ (no dots, so no traversal) and the
   * result is checked to stay under the root.
   */
  private resolveKey(storageKey: string): string {
    const segments = storageKey.split('/');

    if (
      segments.length < 2 ||
      segments.length > 4 ||
      !segments.every((segment) => STORAGE_SEGMENT_PATTERN.test(segment))
    ) {
      throw new AttachmentFileMissingError('invalid storage key');
    }

    const absolute = resolve(this.root, ...segments);

    if (!absolute.startsWith(this.root + sep)) {
      throw new AttachmentFileMissingError('invalid storage key');
    }

    return absolute;
  }

  private assertTempPath(tempPath: string): string {
    const absolute = resolve(tempPath);

    if (dirname(absolute) !== this.tempDir || !absolute.endsWith('.part')) {
      throw new AttachmentStorageUnavailableError('not a temporary path');
    }

    return absolute;
  }

  async commit(tempPath: string, storageKey: string): Promise<void> {
    const source = this.assertTempPath(tempPath);
    const target = this.resolveKey(storageKey);

    try {
      await mkdir(dirname(target), { recursive: true, mode: DIR_MODE });

      try {
        // Atomic and refuses to replace an existing file (EEXIST).
        await link(source, target);
      } catch (error) {
        const code = errorCode(error);

        if (code === 'EEXIST') throw error;

        // A volume without hard links: copy, still never overwriting.
        await copyFile(source, target, fsConstants.COPYFILE_EXCL);
      }
    } catch {
      throw new AttachmentStorageUnavailableError('could not store the file');
    }

    await unlink(source).catch(() => undefined);
  }

  async open(storageKey: string): Promise<OpenedAttachment> {
    const target = this.resolveKey(storageKey);

    let handle;

    try {
      handle = await open(target, 'r');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') throw new AttachmentFileMissingError();
      throw new AttachmentStorageUnavailableError();
    }

    try {
      const info: Stats = await handle.stat();

      if (!info.isFile()) throw new AttachmentFileMissingError();

      // The handle closes itself when the stream ends or is destroyed.
      const stream = handle.createReadStream({ autoClose: true });

      return { stream, size: info.size };
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    const target = this.resolveKey(storageKey);

    try {
      await unlink(target);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        throw new AttachmentStorageUnavailableError();
      }
    }
  }

  async discardTemp(tempPath: string): Promise<void> {
    const target = this.assertTempPath(tempPath);

    await unlink(target).catch((error: unknown) => {
      if (errorCode(error) !== 'ENOENT') {
        throw new AttachmentStorageUnavailableError();
      }
    });
  }

  async openTempReader(tempPath: string): Promise<TempReader> {
    const target = this.assertTempPath(tempPath);
    const handle = await open(target, 'r');

    try {
      const info = await handle.stat();

      const reader: ByteReader = {
        size: info.size,
        read: async (offset, length) => {
          const buffer = Buffer.allocUnsafe(length);
          const { bytesRead } = await handle.read(buffer, 0, length, offset);

          return buffer.subarray(0, bytesRead);
        },
      };

      return { reader, close: () => handle.close() };
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  }

  async freeBytes(): Promise<number> {
    try {
      const info = await statfs(this.root);

      return Number(info.bavail) * Number(info.bsize);
    } catch {
      throw new AttachmentStorageUnavailableError();
    }
  }

  async sweepTemp(maxAgeMs: number, limit: number): Promise<number> {
    let removed = 0;
    let seen = 0;
    const cutoff = Date.now() - maxAgeMs;

    let directory;

    try {
      directory = await opendir(this.tempDir);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return 0;
      throw new AttachmentStorageUnavailableError();
    }

    try {
      for await (const entry of directory as AsyncIterable<Dirent>) {
        seen += 1;
        if (seen > limit) break;
        if (!entry.isFile() || !entry.name.endsWith('.part')) continue;

        const path = join(this.tempDir, entry.name);

        try {
          const info = await stat(path);

          if (info.mtimeMs < cutoff) {
            await unlink(path);
            removed += 1;
          }
        } catch {
          // Raced with another process: the file is gone or busy. Skip it.
        }
      }
    } finally {
      await directory.close().catch(() => undefined);
    }

    return removed;
  }
}
