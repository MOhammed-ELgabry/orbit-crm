import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * A multer "storage engine" that streams the upload to a temporary file on
 * disk instead of keeping it in memory, counting bytes and computing the
 * SHA-256 on the way.
 *
 * The engine is a static object (multer options are fixed at decoration
 * time), so everything request specific - the temporary path, the byte
 * ceiling and how to build errors - comes from the context that the
 * preflight interceptor attached to the request AFTER the caller was
 * authorised. Without that context nothing is written: an upload can never
 * reach the disk unless the preflight accepted it first.
 *
 * No framework imports: the engine is unit-testable on its own.
 */

export const UPLOAD_CONTEXT_KEY = 'chatAttachmentUpload';

export interface UploadContext {
  /** Absolute path of the temporary file (created exclusively). */
  tempPath: string;
  /** More bytes than this abort the upload. */
  maxBytes: number;
  tooLarge(): Error;
  failed(): Error;
}

export interface IncomingUploadFile {
  stream: Readable;
  originalname?: string;
  mimetype?: string;
}

/** What the engine reports back to multer (becomes `request.file`). */
export interface StoredTempFile {
  path: string;
  size: number;
  sha256: string;
}

type EngineCallback = (error?: unknown, info?: Partial<StoredTempFile>) => void;

type RequestWithContext = Record<string, unknown>;

export function getUploadContext(request: unknown): UploadContext | null {
  const context = (request as RequestWithContext | undefined)?.[
    UPLOAD_CONTEXT_KEY
  ];

  return context && typeof context === 'object'
    ? (context as UploadContext)
    : null;
}

export function setUploadContext(
  request: unknown,
  context: UploadContext,
): void {
  (request as RequestWithContext)[UPLOAD_CONTEXT_KEY] = context;
}

async function receive(
  file: IncomingUploadFile,
  context: UploadContext,
): Promise<StoredTempFile> {
  // 'wx': fail if it exists (never overwrite); 0600: owner only.
  const handle = await open(context.tempPath, 'wx', 0o600);
  const hash = createHash('sha256');
  let size = 0;
  let completed = false;
  // Held in an object so the narrowing of a closure-assigned `let` cannot
  // hide the assignment from the compiler.
  const state: { limitError: Error | null } = { limitError: null };

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;

      if (size > context.maxBytes) {
        state.limitError = context.tooLarge();
        done(state.limitError);
        return;
      }

      hash.update(chunk);
      done(null, chunk);
    },
  });

  try {
    // The sink is a small async function (not `handle.createWriteStream`):
    // a write stream with `autoClose: false` never emits 'close', and
    // `pipeline` then never settles. Writing through the FileHandle also
    // lets the same handle be synced and closed below.
    await pipeline(
      file.stream,
      counter,
      async (source: AsyncIterable<Buffer>) => {
        for await (const chunk of source) {
          let offset = 0;

          while (offset < chunk.length) {
            const { bytesWritten } = await handle.write(
              chunk,
              offset,
              chunk.length - offset,
              null,
            );

            offset += bytesWritten;
          }
        }
      },
    );

    // Durable before anyone treats the file as complete.
    await handle.sync();
    completed = true;
  } catch {
    // The byte ceiling is reported as such; anything else (client abort,
    // disk error) is one generic failure with no detail.
    throw state.limitError ?? context.failed();
  } finally {
    await handle.close().catch(() => undefined);

    if (!completed) {
      await unlink(context.tempPath).catch(() => undefined);
    }
  }

  return { path: context.tempPath, size, sha256: hash.digest('hex') };
}

export const attachmentTempStorage = {
  _handleFile(
    request: unknown,
    file: IncomingUploadFile,
    callback: EngineCallback,
  ): void {
    // The file is opened asynchronously before `pipeline` attaches its own
    // handlers. A client that aborts in that window must not become an
    // unhandled 'error' event (which would take the process down): the
    // failure is still reported, through `pipeline`, as one generic error.
    file.stream.on('error', () => undefined);

    const context = getUploadContext(request);

    if (!context) {
      // Not reachable through the controller (the preflight always runs
      // first); refuse rather than guess a destination.
      file.stream.resume();
      callback(new Error('upload context missing'));
      return;
    }

    receive(file, context).then(
      (info) => callback(null, info),
      (error: unknown) => {
        // Make sure the rest of the body is drained, not buffered.
        file.stream.resume();
        callback(error);
      },
    );
  },

  _removeFile(
    _request: unknown,
    file: Partial<StoredTempFile>,
    callback: (error?: unknown) => void,
  ): void {
    if (!file.path) {
      callback(null);
      return;
    }

    unlink(file.path).then(
      () => callback(null),
      () => callback(null),
    );
  },
};
