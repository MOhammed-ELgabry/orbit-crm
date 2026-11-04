import {
  detectSpreadsheetContainer,
  inspectXls,
  inspectXlsx,
  isEncryptedOoxmlPackage,
  SpreadsheetRejectedError,
} from './attachment-spreadsheet-inspector';
import {
  XLS_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  type ChatAttachmentContentType,
  type ChatAttachmentKindName,
} from './chat-attachments.constants';

/**
 * Decides what an uploaded file REALLY is from its bytes (never from the
 * client's file name, extension or MIME type) and validates its structure.
 *
 * It reads through a positional reader, so a file is never loaded into
 * memory as a whole: images are walked chunk/segment by chunk/segment and a
 * PDF is scanned in 64 KiB windows.
 *
 * Excel workbooks (.xlsx / .xls) are validated by
 * attachment-spreadsheet-inspector.ts (container structure only - nothing is
 * evaluated or executed) and, unlike images and PDFs, must also AGREE with the
 * file extension and the declared MIME type.
 *
 * What this is NOT: an antivirus. Passing these checks means "the file has
 * the structure of a PNG/JPEG/WebP/PDF/workbook within the configured limits";
 * it does not prove the content is harmless. The application never renders a PDF
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
  spreadsheetMaxBytes: number;
  maxImageDimension: number;
  maxImagePixels: number;
}

export interface InspectionResult {
  kind: ChatAttachmentKindName;
  contentType: ChatAttachmentContentType;
  width: number | null;
  height: number | null;
}

/**
 * What the client SAID about the file. Never used to decide the type (the
 * bytes do); only cross-checked for spreadsheets.
 */
export interface InspectionHints {
  /** `file.originalname` as sent by the client. */
  originalName?: string;
  /** `file.mimetype` as sent by the client. */
  declaredMimeType?: string;
}

export type InspectionFailure =
  | 'empty'
  | 'unsupported_type'
  | 'corrupt'
  | 'too_large'
  | 'dimensions'
  | 'pdf_encrypted'
  | 'pdf_active_content'
  | 'type_mismatch'
  | 'spreadsheet_macro'
  | 'spreadsheet_encrypted'
  | 'spreadsheet_active_content';

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

// --- spreadsheets: extension / MIME agreement ---------------------------

/** Last extension of a client-supplied name (lower case), or ''. */
export function extensionOf(name: string | undefined): string {
  if (typeof name !== 'string') return '';

  const last = name.split(/[\\/]/).pop() ?? '';
  const dot = last.lastIndexOf('.');

  if (dot <= 0 || dot === last.length - 1) return '';

  const extension = last.slice(dot + 1).toLowerCase();

  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : '';
}

const SUPPORTED_SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls']);

/** Excel extensions that carry macros: refused outright. */
const MACRO_EXTENSIONS = new Set(['xlsm', 'xltm', 'xlam', 'xla', 'xlm']);

/** Other Excel-family formats that are simply not supported. */
const OTHER_EXCEL_EXTENSIONS = new Set(['xlsb', 'xlt', 'xltx', 'xlw', 'xll']);

/** MIME types browsers use for each supported workbook format. */
const SPREADSHEET_MIME_TYPES: Record<'xlsx' | 'xls', readonly string[]> = {
  xlsx: [XLSX_CONTENT_TYPE],
  xls: [
    XLS_CONTENT_TYPE,
    'application/x-msexcel',
    'application/x-excel',
    'application/excel',
  ],
};

/**
 * "The browser did not classify it" (common on Windows without Office):
 * not a disagreement, so it is accepted for a file whose extension AND
 * content are already a workbook. Anything else that is not the right
 * workbook type (text/html, image/png, application/pdf, application/zip...)
 * is a mismatch.
 */
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream']);

const ALL_SPREADSHEET_MIME_TYPES = new Set([
  ...SPREADSHEET_MIME_TYPES.xlsx,
  ...SPREADSHEET_MIME_TYPES.xls,
]);

function normalizeMime(value: string | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}

type Container = 'xlsx' | 'xls' | 'other';

/**
 * Cross-checks the three claims (extension, MIME type, real content) when a
 * spreadsheet is involved on ANY of the three sides. Files that involve no
 * spreadsheet claim at all (the existing image / PDF flow) are not affected.
 */
function checkSpreadsheetAgreement(
  container: Container,
  hints: InspectionHints,
): void {
  const extension = extensionOf(hints.originalName);
  const mime = normalizeMime(hints.declaredMimeType);

  const claimsSpreadsheet =
    SUPPORTED_SPREADSHEET_EXTENSIONS.has(extension) ||
    OTHER_EXCEL_EXTENSIONS.has(extension) ||
    ALL_SPREADSHEET_MIME_TYPES.has(mime);

  if (container === 'other') {
    // The unchanged image / PDF path, unless the name or the MIME type claims
    // Excel while the bytes are something else (a renamed PDF, image, HTML...).
    return claimsSpreadsheet ? reject('type_mismatch') : undefined;
  }

  // The bytes are a ZIP / compound file. A plain archive or Office document
  // that does not even claim to be a workbook is just an unsupported type.
  if (!claimsSpreadsheet) return reject('unsupported_type');

  // Otherwise the extension must be the matching workbook extension...
  if (extension !== container) return reject('type_mismatch');

  // ...and the declared MIME type must be that format's, or unclassified.
  if (
    !GENERIC_MIME_TYPES.has(mime) &&
    !SPREADSHEET_MIME_TYPES[container].includes(mime)
  ) {
    return reject('type_mismatch');
  }
}

/** Macro / unsupported Excel names are refused before any bytes are read. */
function checkExcelExtension(hints: InspectionHints): void {
  const extension = extensionOf(hints.originalName);

  if (MACRO_EXTENSIONS.has(extension)) return reject('spreadsheet_macro');
  if (OTHER_EXCEL_EXTENSIONS.has(extension)) return reject('unsupported_type');
}

const SPREADSHEET_FAILURE: Record<
  SpreadsheetRejectedError['failure'],
  InspectionFailure
> = {
  corrupt: 'corrupt',
  not_spreadsheet: 'type_mismatch',
  macro: 'spreadsheet_macro',
  encrypted: 'spreadsheet_encrypted',
  active_content: 'spreadsheet_active_content',
};

async function inspectSpreadsheet(
  reader: ByteReader,
  container: 'xlsx' | 'xls',
): Promise<void> {
  try {
    if (container === 'xlsx') await inspectXlsx(reader);
    else await inspectXls(reader);
  } catch (error) {
    if (error instanceof SpreadsheetRejectedError) {
      return reject(SPREADSHEET_FAILURE[error.failure]);
    }

    throw error;
  }
}

export async function inspectAttachment(
  reader: ByteReader,
  limits: InspectionLimits,
  hints: InspectionHints = {},
): Promise<InspectionResult> {
  if (reader.size <= 0) return reject('empty');

  // Macro-enabled and other unsupported Excel names: refused before reading.
  checkExcelExtension(hints);

  const head = await reader.read(0, 12);

  let contentType: ChatAttachmentContentType | null = null;

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
  }

  const container: Container =
    contentType === null
      ? (detectSpreadsheetContainer(head) ?? 'other')
      : 'other';

  if (contentType === null && container === 'other') {
    // Unknown bytes. A file that CLAIMS to be Excel is a mismatch; anything
    // else is simply an unsupported type (unchanged behaviour).
    checkSpreadsheetAgreement('other', hints);

    return reject('unsupported_type');
  }

  if (contentType !== null) {
    // Image / PDF bytes: refused only when the name or MIME claims Excel.
    checkSpreadsheetAgreement('other', hints);
  }

  if (container !== 'other') {
    // Size first: an oversized file is refused before any structure is read.
    if (reader.size > limits.spreadsheetMaxBytes) return reject('too_large');

    // A password-protected .xlsx is a compound file named .xlsx: say so
    // clearly instead of "wrong type".
    if (
      container === 'xls' &&
      extensionOf(hints.originalName) === 'xlsx' &&
      (await isEncryptedOoxmlPackage(reader))
    ) {
      return reject('spreadsheet_encrypted');
    }

    checkSpreadsheetAgreement(container, hints);

    await inspectSpreadsheet(reader, container);

    return {
      kind: 'SPREADSHEET',
      contentType: container === 'xlsx' ? XLSX_CONTENT_TYPE : XLS_CONTENT_TYPE,
      width: null,
      height: null,
    };
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
    contentType: contentType as ChatAttachmentContentType,
    width: dimensions.width,
    height: dimensions.height,
  };
}
