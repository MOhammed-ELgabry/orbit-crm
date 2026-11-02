import type {
  ChatAttachmentContentType,
  ChatAttachmentKindName,
} from './chat-attachments.constants';

/**
 * Decides what an uploaded file REALLY is from its bytes (never from the
 * client's file name, extension or MIME type) and validates its structure.
 *
 * It reads through a positional reader, so a file is never loaded into
 * memory as a whole: images are walked chunk/segment by chunk/segment and a
 * PDF is scanned in 64 KiB windows.
 *
 * What this is NOT: an antivirus. Passing these checks means "the file has
 * the structure of a PNG/JPEG/WebP/PDF within the configured limits"; it does
 * not prove the content is harmless. The application never renders a PDF
 * (download only) and serves every file with `nosniff` and a sandbox CSP.
 *
 * No framework imports on purpose: the module is pure and unit-testable.
 */

export interface ByteReader {
  readonly size: number;
  /** Reads up to `length` bytes at `offset` (fewer only at end of file). */
  read(offset: number, length: number): Promise<Buffer>;
}

export interface InspectionLimits {
  imageMaxBytes: number;
  pdfMaxBytes: number;
  maxImageDimension: number;
  maxImagePixels: number;
}

export interface InspectionResult {
  kind: ChatAttachmentKindName;
  contentType: ChatAttachmentContentType;
  width: number | null;
  height: number | null;
}

export type InspectionFailure =
  | 'empty'
  | 'unsupported_type'
  | 'corrupt'
  | 'too_large'
  | 'dimensions'
  | 'pdf_encrypted'
  | 'pdf_active_content';

export class AttachmentRejectedError extends Error {
  constructor(readonly failure: InspectionFailure) {
    super(`attachment rejected: ${failure}`);
    this.name = 'AttachmentRejectedError';
  }
}

const reject = (failure: InspectionFailure): never => {
  throw new AttachmentRejectedError(failure);
};

/** Reader over an in-memory buffer (tests, small inputs). */
export class BufferReader implements ByteReader {
  constructor(private readonly buffer: Buffer) {}

  get size(): number {
    return this.buffer.length;
  }

  read(offset: number, length: number): Promise<Buffer> {
    return Promise.resolve(
      this.buffer.subarray(
        Math.max(0, offset),
        Math.min(this.buffer.length, Math.max(0, offset) + length),
      ),
    );
  }
}

async function readExact(
  reader: ByteReader,
  offset: number,
  length: number,
): Promise<Buffer> {
  if (offset < 0 || offset + length > reader.size) return reject('corrupt');

  const data = await reader.read(offset, length);

  return data.length === length ? data : reject('corrupt');
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Upper bounds on the number of structural steps (bounded work per file). */
const MAX_PNG_CHUNKS = 20_000;
const MAX_JPEG_SEGMENTS = 5_000;
const MAX_WEBP_CHUNKS = 10_000;

interface Dimensions {
  width: number;
  height: number;
}

// --- PNG ---------------------------------------------------------------

async function inspectPng(reader: ByteReader): Promise<Dimensions> {
  let offset = 8;
  let dimensions: Dimensions | null = null;
  let sawData = false;

  for (let index = 0; index < MAX_PNG_CHUNKS; index += 1) {
    const header = await readExact(reader, offset, 8);
    const length = header.readUInt32BE(0);
    const type = header.toString('latin1', 4, 8);

    if (!/^[A-Za-z]{4}$/.test(type)) return reject('corrupt');
    if (length > 0x7fffffff || offset + 12 + length > reader.size) {
      return reject('corrupt');
    }

    if (dimensions === null) {
      if (type !== 'IHDR' || length !== 13) return reject('corrupt');

      const ihdr = await readExact(reader, offset + 8, 13);
      dimensions = {
        width: ihdr.readUInt32BE(0),
        height: ihdr.readUInt32BE(4),
      };
    } else if (type === 'IHDR') {
      return reject('corrupt');
    }

    if (type === 'IDAT') sawData = true;

    if (type === 'IEND') {
      // The image must end exactly here: truncated files and data appended
      // after the image (polyglots) are both refused.
      if (length !== 0 || offset + 12 !== reader.size || !sawData) {
        return reject('corrupt');
      }

      return dimensions;
    }

    offset += 12 + length;
  }

  return reject('corrupt');
}

// --- JPEG --------------------------------------------------------------

async function inspectJpeg(reader: ByteReader): Promise<Dimensions> {
  let offset = 2;
  let dimensions: Dimensions | null = null;

  for (let index = 0; index < MAX_JPEG_SEGMENTS; index += 1) {
    let head = await readExact(reader, offset, 2);

    if (head[0] !== 0xff) return reject('corrupt');

    // Fill bytes: any number of 0xFF may precede a marker.
    while (head[1] === 0xff) {
      offset += 1;
      head = await readExact(reader, offset, 2);
    }

    const marker = head[1];

    // Standalone markers (TEM, RSTn) carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // SOI again, or EOI before any image data: not a valid image.
    if (marker === 0xd8 || marker === 0xd9) return reject('corrupt');

    if (marker === 0xda) {
      // Start of scan: a frame header must have been seen, and the file
      // must end with an EOI marker (truncation check).
      if (dimensions === null) return reject('corrupt');

      const tailLength = Math.min(reader.size, 1024);
      const tail = await readExact(
        reader,
        reader.size - tailLength,
        tailLength,
      );

      if (tail.lastIndexOf(Buffer.from([0xff, 0xd9])) === -1) {
        return reject('corrupt');
      }

      return dimensions;
    }

    const segmentHeader = await readExact(reader, offset, 4);
    const length = segmentHeader.readUInt16BE(2);

    if (length < 2 || offset + 2 + length > reader.size)
      return reject('corrupt');

    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isFrame) {
      if (length < 8 || dimensions !== null) return reject('corrupt');

      const frame = await readExact(reader, offset + 4, 5);
      dimensions = {
        height: frame.readUInt16BE(1),
        width: frame.readUInt16BE(3),
      };
    }

    offset += 2 + length;
  }

  return reject('corrupt');
}

// --- WebP --------------------------------------------------------------

async function inspectWebp(reader: ByteReader): Promise<Dimensions> {
  const riff = await readExact(reader, 0, 12);
  const riffEnd = riff.readUInt32LE(4) + 8;

  // The declared RIFF size must fit in the file (truncation check).
  if (riffEnd < 20 || riffEnd > reader.size) return reject('corrupt');

  let offset = 12;
  let dimensions: Dimensions | null = null;
  let sawBitstream = false;

  for (let index = 0; index < MAX_WEBP_CHUNKS && offset < riffEnd; index += 1) {
    const header = await readExact(reader, offset, 8);
    const fourcc = header.toString('latin1', 0, 4);
    const size = header.readUInt32LE(4);
    const payload = offset + 8;

    if (payload + size > riffEnd) return reject('corrupt');

    if (index === 0) {
      if (fourcc === 'VP8X') {
        if (size < 10) return reject('corrupt');

        const vp8x = await readExact(reader, payload, 10);

        // Animation flag: animated WebP is not part of the product scope.
        if ((vp8x[0] & 0x02) !== 0) return reject('unsupported_type');

        dimensions = {
          width: 1 + vp8x.readUIntLE(4, 3),
          height: 1 + vp8x.readUIntLE(7, 3),
        };
      } else if (fourcc === 'VP8L') {
        if (size < 5) return reject('corrupt');

        const vp8l = await readExact(reader, payload, 5);

        if (vp8l[0] !== 0x2f) return reject('corrupt');

        const bits = vp8l.readUInt32LE(1);

        dimensions = {
          width: 1 + (bits & 0x3fff),
          height: 1 + ((bits >>> 14) & 0x3fff),
        };
        sawBitstream = true;
      } else if (fourcc === 'VP8 ') {
        if (size < 10) return reject('corrupt');

        const vp8 = await readExact(reader, payload, 10);

        if (vp8[3] !== 0x9d || vp8[4] !== 0x01 || vp8[5] !== 0x2a) {
          return reject('corrupt');
        }

        dimensions = {
          width: vp8.readUInt16LE(6) & 0x3fff,
          height: vp8.readUInt16LE(8) & 0x3fff,
        };
        sawBitstream = true;
      } else {
        return reject('unsupported_type');
      }
    } else if (fourcc === 'VP8 ' || fourcc === 'VP8L') {
      sawBitstream = true;
    } else if (fourcc === 'ANIM' || fourcc === 'ANMF') {
      return reject('unsupported_type');
    }

    // Chunks are padded to an even size.
    offset = payload + size + (size % 2);
  }

  if (dimensions === null || !sawBitstream || offset !== riffEnd) {
    return reject('corrupt');
  }

  return dimensions;
}

// --- PDF ---------------------------------------------------------------

const PDF_SCAN_WINDOW = 64 * 1024;
const PDF_SCAN_OVERLAP = 32;

/**
 * Names whose presence in the (uncompressed) file body we refuse. Matching a
 * whole name token ("/XFA" must not match "/XFAForm"). The very short "/JS"
 * is deliberately NOT listed: a JavaScript action always carries
 * "/S /JavaScript", and a 3-byte token would match compressed stream data by
 * chance in large files (false rejections).
 */
const PDF_FORBIDDEN_NAME =
  /\/(Encrypt|JavaScript|Launch|EmbeddedFile|RichMedia|XFA)(?![A-Za-z0-9#])/;

async function inspectPdf(reader: ByteReader): Promise<void> {
  if (reader.size < 32) return reject('corrupt');

  const head = await readExact(reader, 0, 8);

  if (!/^%PDF-[12]\.\d/.test(head.toString('latin1'))) return reject('corrupt');

  const tailLength = Math.min(reader.size, 2048);
  const tail = (
    await readExact(reader, reader.size - tailLength, tailLength)
  ).toString('latin1');

  if (!tail.includes('%%EOF')) return reject('corrupt');

  const startxref = [...tail.matchAll(/startxref\s+(\d{1,12})/g)].pop();

  if (!startxref || Number(startxref[1]) >= reader.size)
    return reject('corrupt');

  // Scan the whole body in bounded windows (overlapping, so a token cut by a
  // window boundary is still seen).
  let offset = 0;
  let carry = '';

  while (offset < reader.size) {
    const chunk = await reader.read(offset, PDF_SCAN_WINDOW);

    if (chunk.length === 0) break;

    const text = carry + chunk.toString('latin1');
    const found = PDF_FORBIDDEN_NAME.exec(text);

    if (found) {
      return reject(
        found[1] === 'Encrypt' ? 'pdf_encrypted' : 'pdf_active_content',
      );
    }

    carry = text.slice(-PDF_SCAN_OVERLAP);
    offset += chunk.length;
  }
}

// --- entry point -------------------------------------------------------

function checkDimensions(
  dimensions: Dimensions,
  limits: InspectionLimits,
): void {
  const { width, height } = dimensions;

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return reject('corrupt');
  }

  if (width < 1 || height < 1) return reject('corrupt');

  if (
    width > limits.maxImageDimension ||
    height > limits.maxImageDimension ||
    width * height > limits.maxImagePixels
  ) {
    return reject('dimensions');
  }
}

export async function inspectAttachment(
  reader: ByteReader,
  limits: InspectionLimits,
): Promise<InspectionResult> {
  if (reader.size <= 0) return reject('empty');

  const head = await reader.read(0, 12);

  let contentType: ChatAttachmentContentType;

  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    contentType = 'image/png';
  } else if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  ) {
    contentType = 'image/jpeg';
  } else if (
    head.length >= 12 &&
    head.toString('latin1', 0, 4) === 'RIFF' &&
    head.toString('latin1', 8, 12) === 'WEBP'
  ) {
    contentType = 'image/webp';
  } else if (head.length >= 5 && head.toString('latin1', 0, 5) === '%PDF-') {
    contentType = 'application/pdf';
  } else {
    return reject('unsupported_type');
  }

  if (contentType === 'application/pdf') {
    if (reader.size > limits.pdfMaxBytes) return reject('too_large');

    await inspectPdf(reader);

    return { kind: 'PDF', contentType, width: null, height: null };
  }

  if (reader.size > limits.imageMaxBytes) return reject('too_large');

  const dimensions =
    contentType === 'image/png'
      ? await inspectPng(reader)
      : contentType === 'image/jpeg'
        ? await inspectJpeg(reader)
        : await inspectWebp(reader);

  checkDimensions(dimensions, limits);

  return {
    kind: 'IMAGE',
    contentType,
    width: dimensions.width,
    height: dimensions.height,
  };
}
