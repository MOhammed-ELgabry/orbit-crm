import { BadRequestException } from '@nestjs/common';

import { AVATAR_MAX_BYTES } from './avatar.constants';
import { inspectAvatarImage } from './avatar-image.util';

/** A minimal PNG header: signature + IHDR(width, height). */
function png(width: number, height: number, extra = 0): Buffer {
  const buf = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** SOI, an APP0 segment, then SOF0 with the given size. */
function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([
    0xff,
    0xe0,
    0x00,
    0x10,
    ...new Array<number>(14).fill(0),
  ]);
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}

function webpExtended(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(32, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function webpLossless(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf[20] = 0x2f;
  buf.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return buf;
}

function webpLossy(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

const rejects = (buf: Buffer | undefined) =>
  expect(() => inspectAvatarImage(buf)).toThrow(BadRequestException);

describe('inspectAvatarImage', () => {
  it('accepts a PNG and reads its size from the header', () => {
    expect(inspectAvatarImage(png(512, 256))).toEqual({
      contentType: 'image/png',
      width: 512,
      height: 256,
    });
  });

  it('accepts a JPEG and reads its size from the frame header', () => {
    expect(inspectAvatarImage(jpeg(300, 200))).toEqual({
      contentType: 'image/jpeg',
      width: 300,
      height: 200,
    });
  });

  it.each([
    ['extended', webpExtended(640, 480)],
    ['lossless', webpLossless(640, 480)],
    ['lossy', webpLossy(640, 480)],
  ])('accepts a %s WebP and reads its size', (_name, buf) => {
    expect(inspectAvatarImage(buf)).toEqual({
      contentType: 'image/webp',
      width: 640,
      height: 480,
    });
  });

  it('decides by content, not by anything the client says about the file', () => {
    // There is no file name / MIME parameter at all: a PNG is a PNG.
    expect(inspectAvatarImage(png(10, 10)).contentType).toBe('image/png');
  });

  it.each([
    [
      'SVG with a script',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ],
    ['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['plain text', Buffer.from('hello world, definitely an image')],
    ['GIF', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary')],
    ['Windows executable', Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary')],
    ['ELF executable', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])],
    ['PDF', Buffer.from('%PDF-1.7\n')],
    ['ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
  ])('rejects %s', (_name, buf) => {
    rejects(buf);
  });

  it('rejects a non-image whose bytes merely end in an image name or carry a PNG-looking prefix', () => {
    // Signature alone is not enough: the header must also be well formed.
    rejects(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('<script>'),
      ]),
    );
  });

  it('rejects empty and missing files', () => {
    rejects(undefined);
    rejects(Buffer.alloc(0));
  });

  it('rejects a file over the size limit, even if it starts like a PNG', () => {
    rejects(png(64, 64, AVATAR_MAX_BYTES));
  });

  it('accepts a file exactly at the size limit', () => {
    expect(() =>
      inspectAvatarImage(png(64, 64, AVATAR_MAX_BYTES - 33)),
    ).not.toThrow();
  });

  it('rejects truncated images', () => {
    rejects(png(64, 64).subarray(0, 12));
    rejects(jpeg(64, 64).subarray(0, 6));
    rejects(webpExtended(64, 64).subarray(0, 20));
  });

  it('rejects a JPEG with no frame header', () => {
    rejects(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x00, 0x00]));
  });

  it('rejects zero-sized and absurdly large dimensions', () => {
    rejects(png(0, 10));
    rejects(png(10, 0));
    rejects(png(100_000, 100_000));
    rejects(jpeg(5000, 100));
  });
});
