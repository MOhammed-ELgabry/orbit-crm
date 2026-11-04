/* eslint-disable @typescript-eslint/unbound-method -- jest asserts on mock methods */
import { Readable, Writable } from 'node:stream';

import { NotFoundException } from '@nestjs/common';

import { ChatAttachmentsController } from './chat-attachments.controller';
import {
  XLS_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from './chat-attachments.constants';
import type { ChatAttachmentsService } from './chat-attachments.service';
import { attachmentRow } from './chat-attachments-test-doubles';

/** Minimal Express-like response that really receives the piped bytes. */
class FakeResponse extends Writable {
  readonly headers = new Map<string, string | number>();
  statusCode = 0;
  body: Buffer[] = [];

  setHeader(name: string, value: string | number) {
    this.headers.set(name.toLowerCase(), value);
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void) {
    this.body.push(chunk);
    done();
  }
}

const request = (headers: Record<string, string> = {}) =>
  ({ user: { sub: 'u2' }, headers }) as never;

function setup(
  kind: string,
  contentType: string,
  bytes: Buffer,
  displayName = 'Sales Q1.xlsx',
) {
  const row = attachmentRow({
    id: 'att-1',
    kind: kind as never,
    contentType: contentType as never,
    displayName,
    sizeBytes: bytes.length,
    sha256: 'a'.repeat(64),
    status: 'ATTACHED',
    messageId: 'm1',
    expiresAt: null,
  });
  const stream = Readable.from([bytes]);
  const service = {
    download: jest
      .fn()
      .mockResolvedValue({ row, opened: { size: bytes.length, stream } }),
  } as unknown as jest.Mocked<ChatAttachmentsService>;

  return {
    controller: new ChatAttachmentsController(service),
    service,
    stream,
  };
}

describe('ChatAttachmentsController.download - response headers', () => {
  it.each([
    ['SPREADSHEET', XLSX_CONTENT_TYPE, 'Sales Q1.xlsx'],
    ['SPREADSHEET', XLS_CONTENT_TYPE, 'old.xls'],
    ['PDF', 'application/pdf', 'invoice.pdf'],
  ])(
    'serves %s (%s) only as a download, never inline',
    async (kind, type, name) => {
      const bytes = Buffer.from('original workbook bytes');
      const { controller } = setup(kind, type, bytes, name);
      const res = new FakeResponse();

      await controller.download(
        request(),
        { id: 'dm-1', attachmentId: 'att-1' },
        res as never,
      );

      expect(String(res.headers.get('content-disposition'))).toMatch(
        /^attachment;/,
      );
      expect(res.headers.get('content-type')).toBe(type);
      expect(res.headers.get('content-length')).toBe(bytes.length);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBe(
        "default-src 'none'; sandbox",
      );
      expect(res.headers.get('cache-control')).toBe('private, no-cache');
      expect(res.statusCode).toBe(200);
      // The ORIGINAL bytes, untouched (no server-side processing of the file).
      expect(Buffer.concat(res.body).equals(bytes)).toBe(true);
    },
  );

  it('encodes the file name in Content-Disposition (RFC 5987), so it cannot inject a header', async () => {
    const { controller } = setup(
      'SPREADSHEET',
      XLSX_CONTENT_TYPE,
      Buffer.from('x'),
      'a"; filename=evil.exe\r\nX-Injected: 1.xlsx',
    );
    const res = new FakeResponse();

    await controller.download(
      request(),
      { id: 'dm-1', attachmentId: 'att-1' },
      res as never,
    );

    const disposition = String(res.headers.get('content-disposition'));

    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition.startsWith('attachment; filename="')).toBe(true);
    expect(disposition).toContain("filename*=UTF-8''");
  });

  it('still serves images inline (existing behaviour)', async () => {
    const { controller } = setup(
      'IMAGE',
      'image/png',
      Buffer.from('png'),
      'photo.png',
    );
    const res = new FakeResponse();

    await controller.download(
      request(),
      { id: 'dm-1', attachmentId: 'att-1' },
      res as never,
    );

    expect(String(res.headers.get('content-disposition'))).toMatch(/^inline;/);
  });

  it('treats any kind it does not know as a download (safe default for future kinds)', async () => {
    const { controller } = setup(
      'SOMETHING_NEW',
      'application/octet-stream',
      Buffer.from('x'),
      'f.bin',
    );
    const res = new FakeResponse();

    await controller.download(
      request(),
      { id: 'dm-1', attachmentId: 'att-1' },
      res as never,
    );

    expect(String(res.headers.get('content-disposition'))).toMatch(
      /^attachment;/,
    );
  });

  it('answers 304 without a body when the ETag matches (access is re-checked first)', async () => {
    const { controller, service, stream } = setup(
      'SPREADSHEET',
      XLSX_CONTENT_TYPE,
      Buffer.from('abc'),
    );
    const res = new FakeResponse();

    await controller.download(
      request({ 'if-none-match': `"${'a'.repeat(64)}"` }),
      { id: 'dm-1', attachmentId: 'att-1' },
      res as never,
    );

    expect(service.download).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(304);
    expect(res.body).toEqual([]);
    expect(stream.destroyed).toBe(true);
  });
});

describe('ChatAttachmentsController.download - authorization is delegated, never decided here', () => {
  it('passes only the authenticated user id and the route ids to the service (no company id from anywhere)', async () => {
    const { controller, service } = setup(
      'SPREADSHEET',
      XLSX_CONTENT_TYPE,
      Buffer.from('x'),
    );
    const res = new FakeResponse();

    await controller.download(
      {
        user: { sub: 'u2', companyId: 'FORGED' },
        headers: {},
        query: { companyId: 'FORGED' },
      } as never,
      { id: 'dm-1', attachmentId: 'att-1' },
      res as never,
    );

    expect(service.download).toHaveBeenCalledWith('u2', 'dm-1', 'att-1');
  });

  it('writes nothing when the service refuses (unauthorized or cross-company -> 404)', async () => {
    const service = {
      download: jest
        .fn()
        .mockRejectedValue(new NotFoundException('attachment_not_found')),
    } as unknown as jest.Mocked<ChatAttachmentsService>;
    const controller = new ChatAttachmentsController(service);
    const res = new FakeResponse();

    await expect(
      controller.download(
        request(),
        { id: 'dm-1', attachmentId: 'att-1' },
        res as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(res.headers.size).toBe(0);
    expect(res.body).toEqual([]);
  });
});
