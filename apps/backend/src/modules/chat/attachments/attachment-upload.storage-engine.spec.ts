import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import {
  attachmentTempStorage,
  setUploadContext,
  type StoredTempFile,
  type UploadContext,
} from './attachment-upload.storage-engine';

describe('attachmentTempStorage (multer engine)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'orbit-att-engine-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const context = (maxBytes: number, name = 'a.part'): UploadContext => ({
    tempPath: join(dir, name),
    maxBytes,
    tooLarge: () => new Error('too-large'),
    failed: () => new Error('failed'),
  });

  const handle = (request: object, stream: Readable) =>
    new Promise<{ error?: unknown; info?: Partial<StoredTempFile> }>(
      (resolve) => {
        attachmentTempStorage._handleFile(request, { stream }, (error, info) =>
          resolve({ error, info }),
        );
      },
    );

  it('streams to the temp file and reports size and SHA-256 of what was written', async () => {
    const request = {};
    const ctx = context(1024);
    setUploadContext(request, ctx);

    const body = Buffer.from('some attachment bytes');
    const { error, info } = await handle(request, Readable.from([body]));

    expect(error).toBeNull();
    expect(info).toEqual({
      path: ctx.tempPath,
      size: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    });
    expect((await readFile(ctx.tempPath)).equals(body)).toBe(true);
  });

  it('writes NOTHING without an upload context (preflight not passed)', async () => {
    const { error } = await handle({}, Readable.from([Buffer.from('x')]));

    expect((error as Error).message).toBe('upload context missing');
    expect(await readdir(dir)).toEqual([]);
  });

  it('aborts at the byte ceiling and leaves no file', async () => {
    const request = {};
    const ctx = context(10);
    setUploadContext(request, ctx);

    const { error } = await handle(
      request,
      Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
    );

    expect((error as Error).message).toBe('too-large');
    await expect(stat(ctx.tempPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes the partial file when the client aborts mid-upload (interrupted)', async () => {
    const request = {};
    const ctx = context(1024);
    setUploadContext(request, ctx);

    const stream = new PassThrough();
    const pending = handle(request, stream);

    stream.write(Buffer.from('partial'));
    stream.destroy(new Error('client went away'));

    const { error } = await pending;

    expect((error as Error).message).toBe('failed');
    await expect(stat(ctx.tempPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never overwrites an existing temp file', async () => {
    const request = {};
    const ctx = context(1024);
    setUploadContext(request, ctx);

    await handle(request, Readable.from([Buffer.from('first')]));
    const { error } = await handle(
      request,
      Readable.from([Buffer.from('second')]),
    );

    expect(error).toBeDefined();
    expect(await readFile(ctx.tempPath, 'utf8')).toBe('first');
  });

  it('_removeFile deletes the temp file and tolerates a missing one', async () => {
    const request = {};
    const ctx = context(1024);
    setUploadContext(request, ctx);
    await handle(request, Readable.from([Buffer.from('x')]));

    await new Promise<void>((resolve) =>
      attachmentTempStorage._removeFile(request, { path: ctx.tempPath }, () =>
        resolve(),
      ),
    );
    await expect(stat(ctx.tempPath)).rejects.toMatchObject({ code: 'ENOENT' });

    await new Promise<void>((resolve) =>
      attachmentTempStorage._removeFile(request, { path: ctx.tempPath }, () =>
        resolve(),
      ),
    );
  });
});
