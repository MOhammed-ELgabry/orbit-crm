import { BadRequestException } from '@nestjs/common';

import {
  AVATAR_ALLOWED_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_DIMENSION,
  type AvatarContentType,
} from './avatar.constants';

export interface InspectedImage {
  contentType: AvatarContentType;
  width: number;
  height: number;
}

const unsupported = () =>
  new BadRequestException(
    `Unsupported image. Upload a PNG, JPEG or WebP picture (${AVATAR_ALLOWED_TYPES.join(', ')}).`,
  );

const corrupt = () =>
  new BadRequestException('The image file is damaged or incomplete.');

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function readPng(buf: Buffer): InspectedImage {
  // signature(8) + length(4) + "IHDR"(4) + width(4) + height(4)
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw corrupt();
  }

  return {
    contentType: 'image/png',
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function readJpeg(buf: Buffer): InspectedImage {
  let offset = 2; // after SOI

  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      throw corrupt();
    }

    let marker = buf[offset + 1];

    // Fill bytes: any number of 0xFF may precede a marker.
    while (marker === 0xff && offset + 2 < buf.length) {
      offset += 1;
      marker = buf[offset + 1];
    }

    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }

    // Reaching entropy-coded data / end of image before any frame header.
    if (marker === 0xd9 || marker === 0xda) {
      throw corrupt();
    }

    const length = buf.readUInt16BE(offset + 2);

    if (length < 2) {
      throw corrupt();
    }

    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isFrame) {
      if (offset + 9 > buf.length) {
        throw corrupt();
      }

      return {
        contentType: 'image/jpeg',
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  throw corrupt();
}

function readWebp(buf: Buffer): InspectedImage {
  // "RIFF" size "WEBP" then the first chunk: fourcc(4) size(4) payload
  if (buf.length < 30) {
    throw corrupt();
  }

  const fourcc = buf.toString('ascii', 12, 16);

  if (fourcc === 'VP8X') {
    return {
      contentType: 'image/webp',
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }

  if (fourcc === 'VP8L') {
    if (buf[20] !== 0x2f) {
      throw corrupt();
    }

    const bits = buf.readUInt32LE(21);

    return {
      contentType: 'image/webp',
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }

  if (fourcc === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
      throw corrupt();
    }

    return {
      contentType: 'image/webp',
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }

  throw unsupported();
}

/**
 * Decides what a file REALLY is from its leading bytes — never from the
 * client-declared MIME type or the file name — and reads its pixel size from
 * the format's own header, without decoding any pixels.
 *
 * Accepts PNG, JPEG and WebP only. Everything else (SVG, GIF, HTML, scripts,
 * executables, ...) is rejected, as are empty, oversized, truncated and
 * implausibly large images.
 */
export function inspectAvatarImage(buf: Buffer | undefined): InspectedImage {
  if (!buf || buf.length === 0) {
    throw new BadRequestException('The image file is empty.');
  }

  if (buf.length > AVATAR_MAX_BYTES) {
    throw new BadRequestException(
      `The image is too large. The limit is ${AVATAR_MAX_BYTES / 1024} KB.`,
    );
  }

  let image: InspectedImage;

  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    image = readPng(buf);
  } else if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    image = readJpeg(buf);
  } else if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    image = readWebp(buf);
  } else {
    throw unsupported();
  }

  if (image.width < 1 || image.height < 1) {
    throw corrupt();
  }

  if (
    image.width > AVATAR_MAX_DIMENSION ||
    image.height > AVATAR_MAX_DIMENSION
  ) {
    throw new BadRequestException(
      `The image dimensions are too large. The limit is ${AVATAR_MAX_DIMENSION} x ${AVATAR_MAX_DIMENSION} pixels.`,
    );
  }

  return image;
}
