import type { Readable } from 'node:stream';

import type { ByteReader } from './attachment-inspector';

/** The storage backend could not be used (missing root, no permission...). */
export class AttachmentStorageUnavailableError extends Error {
  constructor(message = 'attachment storage is unavailable') {
    super(message);
    this.name = 'AttachmentStorageUnavailableError';
  }
}

/** The stored file does not exist (anymore) or no longer matches. */
export class AttachmentFileMissingError extends Error {
  constructor(message = 'attachment file is missing') {
    super(message);
    this.name = 'AttachmentFileMissingError';
  }
}

export interface OpenedAttachment {
  stream: Readable;
  /** Size of the file ON DISK, read from the open handle. */
  size: number;
}

export interface TempReader {
  reader: ByteReader;
  close(): Promise<void>;
}

/**
 * Where attachment bytes live. The application only talks to this interface,
 * so a different backend (or Encryption at Rest) can replace the local disk
 * adapter later without touching the chat code.
 *
 * Contract:
 *  - A `storageKey` is "<companyId>/<aa>/<random>" (see the CHECK constraint
 *    in the migration). Implementations must refuse anything else.
 *  - Nothing is ever overwritten: `commit` fails if the key already exists.
 *  - No method lists or scans the whole store, except `sweepTemp`, which is
 *    bounded by `limit`.
 */
export interface AttachmentStorage {
  /**
   * Verifies the storage root exists and is usable and prepares the temporary
   * area inside it. Never creates the root itself.
   */
  ensureReady(): Promise<void>;

  /** A fresh, unique path for an upload that is still being received. */
  createTempPath(): string;

  /** Moves a finished temporary file to its final key without overwriting. */
  commit(tempPath: string, storageKey: string): Promise<void>;

  /** Opens a stored file for reading (size comes from the open handle). */
  open(storageKey: string): Promise<OpenedAttachment>;

  /** Deletes a stored file. Deleting a missing file is not an error. */
  remove(storageKey: string): Promise<void>;

  /** Deletes a temporary file. Deleting a missing file is not an error. */
  discardTemp(tempPath: string): Promise<void>;

  /** Positional reader over a temporary file (for content inspection). */
  openTempReader(tempPath: string): Promise<TempReader>;

  /** Free bytes on the volume that holds the root. */
  freeBytes(): Promise<number>;

  /**
   * Removes temporary files older than `maxAgeMs`; looks at no more than
   * `limit` entries. Returns the number removed.
   */
  sweepTemp(maxAgeMs: number, limit: number): Promise<number>;
}
