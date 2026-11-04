import { inflateRawSync } from 'node:zlib';

/**
 * Structural validation of Excel workbooks (`.xlsx` and `.xls`).
 *
 * What it does: reads the CONTAINER only - the ZIP central directory of an
 * `.xlsx` and the compound-file directory plus the workbook BIFF record
 * headers of an `.xls` - to answer "is this really a workbook, and does it
 * carry macros / encryption / embedded objects?".
 *
 * What it never does: evaluate a formula, run or load a macro, render a
 * sheet, follow an external link, or decompress anything beyond the single
 * small `[Content_Types].xml` part (bounded output). The file is only ever
 * stored and served back as a download.
 *
 * What it is NOT: an antivirus. Passing means "has the structure of a plain
 * workbook within bounded limits"; it does not prove the cell content is
 * harmless (a formula such as =HYPERLINK(...) is still just data until a
 * person opens the file in Excel - see the README for the residual risk).
 *
 * `.xlsx` and `.xls` are different formats and are validated differently:
 *   .xlsx = ZIP package  -> central directory, part names, content types
 *   .xls  = OLE2 / CFB   -> directory entries, BIFF globals, sheet types
 *
 * No framework imports on purpose: the module is pure and unit-testable.
 */

export interface SpreadsheetReader {
  readonly size: number;
  /** Reads up to `length` bytes at `offset` (fewer only at end of file). */
  read(offset: number, length: number): Promise<Buffer>;
}

export type SpreadsheetFailure =
  'corrupt' | 'not_spreadsheet' | 'macro' | 'encrypted' | 'active_content';

export class SpreadsheetRejectedError extends Error {
  constructor(readonly failure: SpreadsheetFailure) {
    super(`spreadsheet rejected: ${failure}`);
    this.name = 'SpreadsheetRejectedError';
  }
}

const fail = (failure: SpreadsheetFailure): never => {
  throw new SpreadsheetRejectedError(failure);
};

async function readExact(
  reader: SpreadsheetReader,
  offset: number,
  length: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)) {
    return fail('corrupt');
  }

  if (offset < 0 || length < 0 || offset + length > reader.size) {
    return fail('corrupt');
  }

  const data = await reader.read(offset, length);

  return data.length === length ? data : fail('corrupt');
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export const ZIP_LOCAL_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
export const CFB_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

/** Container format by magic bytes (a hint: the structure is validated next). */
export function detectSpreadsheetContainer(
  head: Buffer,
): 'xlsx' | 'xls' | null {
  if (head.length >= 4 && head.subarray(0, 4).equals(ZIP_LOCAL_SIGNATURE)) {
    return 'xlsx';
  }

  if (head.length >= 8 && head.subarray(0, 8).equals(CFB_SIGNATURE)) {
    return 'xls';
  }

  return null;
}

// ---------------------------------------------------------------------------
// .xlsx  (ZIP / Open Packaging Conventions)
// ---------------------------------------------------------------------------

/** Bounds: a workbook within the size limit is far below all of them. */
export const XLSX_LIMITS = {
  maxEntries: 5_000,
  maxCentralDirectoryBytes: 2 * 1024 * 1024,
  /** Declared (never actually inflated) total; a sanity bound. */
  maxDeclaredUncompressedBytes: 1024 * 1024 * 1024,
  maxContentTypesBytes: 512 * 1024,
} as const;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
const MAX_ZIP_COMMENT = 0xffff;

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function validEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  if (name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;

  return !name.split('/').some((part) => part === '..');
}

/** Part names that mean "this workbook can run code". */
function isMacroPart(lower: string): boolean {
  return (
    lower === 'xl/vbaproject.bin' ||
    lower === 'xl/vbaprojectsignature.bin' ||
    lower === 'xl/vbadata.xml' ||
    lower.startsWith('xl/macrosheets/') ||
    lower.startsWith('xl/dialogsheets/')
  );
}

/** Embedded objects / ActiveX controls: refused as active content. */
function isActivePart(lower: string): boolean {
  return lower.startsWith('xl/activex/') || lower.startsWith('xl/embeddings/');
}

async function readZipEntries(reader: SpreadsheetReader): Promise<ZipEntry[]> {
  if (reader.size < EOCD_MIN + 4) return fail('corrupt');

  // End of central directory: it is the last structure of the file, and the
  // (optional) comment must end exactly at the end of the file.
  const tailLength = Math.min(reader.size, EOCD_MIN + MAX_ZIP_COMMENT);
  const tailStart = reader.size - tailLength;
  const tail = await readExact(reader, tailStart, tailLength);

  let eocd = -1;

  for (let at = tail.length - EOCD_MIN; at >= 0; at -= 1) {
    if (
      tail.readUInt32LE(at) === EOCD_SIGNATURE &&
      at + EOCD_MIN + tail.readUInt16LE(at + 20) === tail.length
    ) {
      eocd = at;
      break;
    }
  }

  if (eocd < 0) return fail('corrupt');

  const diskNumber = tail.readUInt16LE(eocd + 4);
  const cdDisk = tail.readUInt16LE(eocd + 6);
  const entriesOnDisk = tail.readUInt16LE(eocd + 8);
  const totalEntries = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const eocdPosition = tailStart + eocd;

  // Single-disk archives only; ZIP64 is not produced by any spreadsheet tool.
  if (diskNumber !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) {
    return fail('corrupt');
  }

  if (
    totalEntries === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  ) {
    return fail('corrupt');
  }

  if (totalEntries === 0 || totalEntries > XLSX_LIMITS.maxEntries) {
    return fail('corrupt');
  }

  if (cdSize > XLSX_LIMITS.maxCentralDirectoryBytes) return fail('corrupt');

  // The directory must sit right before the end record: no hidden gaps, no
  // trailing/prepended payloads (polyglot files).
  if (cdOffset + cdSize !== eocdPosition) return fail('corrupt');

  const directory = await readExact(reader, cdOffset, cdSize);
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let declaredTotal = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > directory.length) return fail('corrupt');
    if (directory.readUInt32LE(cursor) !== CENTRAL_SIGNATURE)
      return fail('corrupt');

    const flags = directory.readUInt16LE(cursor + 8);
    const method = directory.readUInt16LE(cursor + 10);
    const compressedSize = directory.readUInt32LE(cursor + 20);
    const uncompressedSize = directory.readUInt32LE(cursor + 24);
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const entryDisk = directory.readUInt16LE(cursor + 34);
    const localOffset = directory.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;

    if (next > directory.length || entryDisk !== 0) return fail('corrupt');

    // Bit 0 = encrypted, bit 6 = strong encryption. Excel never writes it.
    if ((flags & 0x0041) !== 0) return fail('encrypted');

    // Stored or deflated only.
    if (method !== 0 && method !== 8) return fail('corrupt');

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      return fail('corrupt');
    }

    const rawName = directory.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = rawName.toString((flags & 0x0800) !== 0 ? 'utf8' : 'latin1');

    if (!validEntryName(name)) return fail('corrupt');

    // Duplicate names are how readers get confused about "which one wins".
    const key = name.toLowerCase();

    if (seen.has(key)) return fail('corrupt');

    seen.add(key);

    declaredTotal += uncompressedSize;

    if (declaredTotal > XLSX_LIMITS.maxDeclaredUncompressedBytes) {
      return fail('corrupt');
    }

    if (localOffset + 30 > cdOffset) return fail('corrupt');

    entries.push({
      name,
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });

    cursor = next;
  }

  if (cursor !== directory.length) return fail('corrupt');

  // Every entry must have a real local header whose name agrees with the
  // directory, and whose data lies before the directory.
  for (const entry of entries) {
    const head = await readExact(reader, entry.localOffset, 30);

    if (head.readUInt32LE(0) !== LOCAL_SIGNATURE) return fail('corrupt');

    const nameLength = head.readUInt16LE(26);
    const extraLength = head.readUInt16LE(28);
    const localFlags = head.readUInt16LE(6);

    if ((localFlags & 0x0041) !== 0) return fail('encrypted');

    const dataStart = entry.localOffset + 30 + nameLength + extraLength;

    if (dataStart + entry.compressedSize > cdOffset) return fail('corrupt');

    const localName = await readExact(
      reader,
      entry.localOffset + 30,
      nameLength,
    );
    const expected = Buffer.from(
      entry.name,
      (entry.flags & 0x0800) !== 0 ? 'utf8' : 'latin1',
    );

    if (!localName.equals(expected)) return fail('corrupt');
  }

  return entries;
}

async function readContentTypes(
  reader: SpreadsheetReader,
  entry: ZipEntry,
): Promise<string> {
  if (
    entry.uncompressedSize > XLSX_LIMITS.maxContentTypesBytes ||
    entry.compressedSize > XLSX_LIMITS.maxContentTypesBytes
  ) {
    return fail('corrupt');
  }

  const local = await readExact(reader, entry.localOffset, 30);
  const dataStart =
    entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const data = await readExact(reader, dataStart, entry.compressedSize);

  if (entry.method === 0) return data.toString('utf8');

  try {
    // Output is capped: a "bomb" in this single small part cannot grow.
    return inflateRawSync(data, {
      maxOutputLength: XLSX_LIMITS.maxContentTypesBytes,
    }).toString('utf8');
  } catch {
    return fail('corrupt');
  }
}

/** `<Override PartName="/xl/workbook.xml" ContentType="..."/>` lookups. */
function overrideContentType(xml: string, partName: string): string | null {
  for (const tag of xml.match(/<Override\b[^>]*>/gi) ?? []) {
    const part = /\bPartName\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    const type = /\bContentType\s*=\s*"([^"]*)"/i.exec(tag)?.[1];

    if (part && type && part.toLowerCase() === partName) return type;
  }

  return null;
}

/**
 * A plain `.xlsx` workbook. Throws SpreadsheetRejectedError otherwise:
 *  - `not_spreadsheet`: a ZIP that is not an Excel workbook (docx, jar, ...);
 *  - `macro`: VBA project / macro sheets / macro-enabled content type
 *    (this is what an `.xlsm` is, even when renamed);
 *  - `active_content`: embedded objects or ActiveX controls;
 *  - `encrypted`: encrypted ZIP entries;
 *  - `corrupt`: damaged or unusual container structure.
 */
export async function inspectXlsx(reader: SpreadsheetReader): Promise<void> {
  const head = await readExact(reader, 0, 4);

  if (!head.equals(ZIP_LOCAL_SIGNATURE)) return fail('not_spreadsheet');

  const entries = await readZipEntries(reader);
  const byName = new Map(
    entries.map((entry) => [entry.name.toLowerCase(), entry]),
  );

  for (const lower of byName.keys()) {
    if (isMacroPart(lower)) return fail('macro');
  }

  const contentTypes = byName.get('[content_types].xml');
  const workbook = byName.get('xl/workbook.xml');

  // Not an Excel package (Word, PowerPoint, plain archives, binary workbooks).
  if (!contentTypes || !workbook || byName.has('xl/workbook.bin')) {
    return fail('not_spreadsheet');
  }

  for (const lower of byName.keys()) {
    if (isActivePart(lower)) return fail('active_content');
  }

  const xml = await readContentTypes(reader, contentTypes);

  if (/macroEnabled|vbaProject/i.test(xml)) return fail('macro');

  const workbookType = overrideContentType(xml, '/xl/workbook.xml');

  // Only the plain workbook type is accepted (no macro, template or add-in).
  if (
    workbookType === null ||
    !/^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml$/i.test(
      workbookType,
    )
  ) {
    return fail('not_spreadsheet');
  }
}

// ---------------------------------------------------------------------------
// .xls  (OLE2 compound file + BIFF)
// ---------------------------------------------------------------------------

const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;

export const XLS_LIMITS = {
  maxFatSectors: 8_192,
  maxDifatSectors: 1_024,
  maxDirectorySectors: 256,
  maxSheets: 1_024,
  /** BIFF record bodies are at most 8224 bytes (CONTINUE splits longer ones). */
  maxRecordBytes: 8_228,
} as const;

interface DirectoryEntry {
  name: string;
  type: number;
  start: number;
  size: number;
}

/** Positional access to a stream that is stored as a chain of sectors. */
class SectorStream {
  constructor(
    readonly size: number,
    private readonly sectorSize: number,
    private readonly chain: readonly number[],
    private readonly readSector: (
      sector: number,
      inner: number,
      length: number,
    ) => Promise<Buffer>,
  ) {}

  async read(offset: number, length: number): Promise<Buffer> {
    if (offset < 0 || length < 0 || offset + length > this.size) {
      return fail('corrupt');
    }

    const parts: Buffer[] = [];
    let position = offset;
    let remaining = length;

    while (remaining > 0) {
      const index = Math.floor(position / this.sectorSize);
      const inner = position % this.sectorSize;
      const take = Math.min(remaining, this.sectorSize - inner);
      const sector = this.chain[index];

      if (sector === undefined) return fail('corrupt');

      parts.push(await this.readSector(sector, inner, take));
      position += take;
      remaining -= take;
    }

    return Buffer.concat(parts);
  }
}

/** Sequential-friendly reader with a small read-ahead window. */
class WindowedStream {
  private windowStart = -1;
  private window: Buffer = Buffer.alloc(0);

  constructor(private readonly stream: SectorStream) {}

  get size(): number {
    return this.stream.size;
  }

  async slice(offset: number, length: number): Promise<Buffer> {
    if (offset < 0 || length < 0 || offset + length > this.stream.size) {
      return fail('corrupt');
    }

    if (
      offset >= this.windowStart &&
      offset + length <= this.windowStart + this.window.length
    ) {
      return this.window.subarray(
        offset - this.windowStart,
        offset - this.windowStart + length,
      );
    }

    const size = Math.min(
      this.stream.size - offset,
      Math.max(length, 64 * 1024),
    );

    this.window = await this.stream.read(offset, size);
    this.windowStart = offset;

    return this.window.subarray(0, length);
  }
}

class CompoundFile {
  private constructor(
    private readonly reader: SpreadsheetReader,
    readonly sectorSize: number,
    private readonly sectorCount: number,
    private readonly fat: readonly number[],
    readonly miniCutoff: number,
    private readonly firstMiniFat: number,
  ) {}

  static async open(reader: SpreadsheetReader): Promise<{
    file: CompoundFile;
    firstDirectory: number;
  }> {
    if (reader.size < 1024) return fail('corrupt');

    const header = await readExact(reader, 0, 512);

    if (!header.subarray(0, 8).equals(CFB_SIGNATURE))
      return fail('not_spreadsheet');

    const major = header.readUInt16LE(26);
    const byteOrder = header.readUInt16LE(28);
    const shift = header.readUInt16LE(30);
    const miniShift = header.readUInt16LE(32);
    const miniCutoff = header.readUInt32LE(56);

    if (byteOrder !== 0xfffe || miniShift !== 6 || miniCutoff !== 4096) {
      return fail('corrupt');
    }

    if (!((major === 3 && shift === 9) || (major === 4 && shift === 12))) {
      return fail('corrupt');
    }

    const sectorSize = 1 << shift;
    const sectorCount = Math.floor(reader.size / sectorSize) - 1;

    if (sectorCount < 2) return fail('corrupt');

    const fatCount = header.readUInt32LE(44);
    const firstDirectory = header.readUInt32LE(48);
    const firstMiniFat = header.readUInt32LE(60);
    const firstDifat = header.readUInt32LE(68);
    const difatCount = header.readUInt32LE(72);

    if (
      fatCount === 0 ||
      fatCount > XLS_LIMITS.maxFatSectors ||
      fatCount > sectorCount
    ) {
      return fail('corrupt');
    }

    if (difatCount > XLS_LIMITS.maxDifatSectors) return fail('corrupt');

    const sectorAt = (id: number) => (id + 1) * sectorSize;
    const fatIds: number[] = [];

    for (let slot = 0; slot < 109 && fatIds.length < fatCount; slot += 1) {
      const id = header.readUInt32LE(76 + slot * 4);

      if (id !== FREESECT) fatIds.push(id);
    }

    let difat = firstDifat;

    for (
      let step = 0;
      fatIds.length < fatCount && difat !== ENDOFCHAIN && step < difatCount;
      step += 1
    ) {
      if (difat >= sectorCount) return fail('corrupt');

      const block = await readExact(reader, sectorAt(difat), sectorSize);
      const slots = sectorSize / 4 - 1;

      for (let slot = 0; slot < slots && fatIds.length < fatCount; slot += 1) {
        const id = block.readUInt32LE(slot * 4);

        if (id !== FREESECT) fatIds.push(id);
      }

      difat = block.readUInt32LE(slots * 4);
    }

    if (fatIds.length !== fatCount) return fail('corrupt');

    const fat: number[] = [];

    for (const id of fatIds) {
      if (id >= sectorCount) return fail('corrupt');

      const block = await readExact(reader, sectorAt(id), sectorSize);

      for (let slot = 0; slot < sectorSize; slot += 4) {
        fat.push(block.readUInt32LE(slot));
      }
    }

    return {
      file: new CompoundFile(
        reader,
        sectorSize,
        sectorCount,
        fat,
        miniCutoff,
        firstMiniFat,
      ),
      firstDirectory,
    };
  }

  chain(
    start: number,
    table: readonly number[] = this.fat,
    limit = this.sectorCount,
  ): number[] {
    const out: number[] = [];
    let sector = start;

    while (sector !== ENDOFCHAIN) {
      if (sector >= limit || sector >= table.length || out.length >= limit) {
        return fail('corrupt');
      }

      out.push(sector);
      sector = table[sector];
    }

    return out;
  }

  private readRegularSector = (sector: number, inner: number, length: number) =>
    readExact(this.reader, (sector + 1) * this.sectorSize + inner, length);

  regularStream(start: number, size: number): SectorStream {
    const chain = this.chain(start);

    if (chain.length * this.sectorSize < size) return fail('corrupt');

    return new SectorStream(
      size,
      this.sectorSize,
      chain,
      this.readRegularSector,
    );
  }

  async miniFat(): Promise<number[]> {
    if (this.firstMiniFat === ENDOFCHAIN) return [];

    const chain = this.chain(this.firstMiniFat);
    const table: number[] = [];

    for (const sector of chain) {
      const block = await this.readRegularSector(sector, 0, this.sectorSize);

      for (let slot = 0; slot < this.sectorSize; slot += 4) {
        table.push(block.readUInt32LE(slot));
      }
    }

    return table;
  }

  miniStream(
    container: SectorStream,
    miniTable: readonly number[],
    start: number,
    size: number,
  ): SectorStream {
    const limit = Math.floor(container.size / 64);
    const chain = this.chain(start, miniTable, limit);

    if (chain.length * 64 < size) return fail('corrupt');

    return new SectorStream(size, 64, chain, (sector, inner, length) =>
      container.read(sector * 64 + inner, length),
    );
  }

  async directory(first: number): Promise<DirectoryEntry[]> {
    const chain = this.chain(first);

    if (chain.length > XLS_LIMITS.maxDirectorySectors) return fail('corrupt');

    const entries: DirectoryEntry[] = [];

    for (const sector of chain) {
      const block = await this.readRegularSector(sector, 0, this.sectorSize);

      for (let at = 0; at + 128 <= block.length; at += 128) {
        const type = block[at + 66];

        if (type === 0) continue; // unallocated

        const nameBytes = block.readUInt16LE(at + 64);

        if (nameBytes < 2 || nameBytes > 64 || nameBytes % 2 !== 0) {
          return fail('corrupt');
        }

        const sizeHigh = block.readUInt32LE(at + 124);

        // Files within the size limit never need a 64-bit stream size.
        if (sizeHigh !== 0) return fail('corrupt');

        entries.push({
          name: block.toString('utf16le', at, at + nameBytes - 2),
          type,
          start: block.readUInt32LE(at + 116),
          size: block.readUInt32LE(at + 120),
        });
      }
    }

    return entries;
  }
}

/** Entry names (compared case-insensitively) that mean macros. */
const XLS_MACRO_NAMES = new Set([
  '_vba_project_cur',
  'vba',
  '_vba_project',
  'macros',
]);
/** Embedded OLE objects. */
const XLS_ACTIVE_NAMES = new Set(['objectpool', '\u0001ole10native']);
/** Encrypted (password protected) OOXML packages live in a compound file. */
const ENCRYPTED_PACKAGE_NAMES = new Set(['encryptedpackage', 'encryptioninfo']);

// BIFF record ids used here (metadata only; no record body is interpreted
// beyond a few flag bytes).
const BIFF_BOF = 0x0809;
const BIFF_EOF = 0x000a;
const BIFF_FILEPASS = 0x002f;
const BIFF_BOUNDSHEET = 0x0085;
const BIFF_OBPROJ = 0x00d3;

const BOF_WORKBOOK_GLOBALS = 0x0005;
const BOF_VB_MODULE = 0x0006;
const BOF_WORKSHEET = 0x0010;
const BOF_CHART = 0x0020;
const BOF_MACRO_SHEET = 0x0040;

async function openDirectory(reader: SpreadsheetReader) {
  const { file, firstDirectory } = await CompoundFile.open(reader);
  const entries = await file.directory(firstDirectory);

  if (entries.length === 0 || entries[0].type !== 5) return fail('corrupt');

  return { file, entries };
}

/**
 * True when the compound file is an encrypted OOXML package (a
 * password-protected `.xlsx`). Never throws; used only to give a clearer
 * message than "wrong type".
 */
export async function isEncryptedOoxmlPackage(
  reader: SpreadsheetReader,
): Promise<boolean> {
  try {
    const { entries } = await openDirectory(reader);

    return entries.some((entry) =>
      ENCRYPTED_PACKAGE_NAMES.has(entry.name.toLowerCase()),
    );
  } catch {
    return false;
  }
}

/**
 * A plain `.xls` workbook (BIFF5 / BIFF8 in a compound file). Throws
 * SpreadsheetRejectedError otherwise:
 *  - `not_spreadsheet`: a compound file that is not a workbook (doc, ppt, msi);
 *  - `macro`: VBA storage, OBPROJ record, or an Excel 4.0 macro / VB module
 *    sheet (checked both in BOUNDSHEET and in the sheet's own BOF);
 *  - `encrypted`: FILEPASS record or an encrypted OOXML package;
 *  - `active_content`: embedded OLE objects;
 *  - `corrupt`: damaged structure.
 */
export async function inspectXls(reader: SpreadsheetReader): Promise<void> {
  const { file, entries } = await openDirectory(reader);

  const names = entries.map((entry) => entry.name.toLowerCase());

  if (names.some((name) => ENCRYPTED_PACKAGE_NAMES.has(name))) {
    return fail('encrypted');
  }

  if (names.some((name) => XLS_MACRO_NAMES.has(name))) return fail('macro');
  if (names.some((name) => XLS_ACTIVE_NAMES.has(name)))
    return fail('active_content');

  const workbook =
    entries.find(
      (entry) => entry.type === 2 && entry.name.toLowerCase() === 'workbook',
    ) ??
    entries.find(
      (entry) => entry.type === 2 && entry.name.toLowerCase() === 'book',
    );

  if (!workbook) return fail('not_spreadsheet');

  let stream: SectorStream;

  if (workbook.size < file.miniCutoff) {
    const root = entries[0];
    const container = file.regularStream(root.start, root.size);

    stream = file.miniStream(
      container,
      await file.miniFat(),
      workbook.start,
      workbook.size,
    );
  } else {
    stream = file.regularStream(workbook.start, workbook.size);
  }

  const data = new WindowedStream(stream);

  if (data.size < 8) return fail('corrupt');

  const bof = await data.slice(0, 8);

  if (bof.readUInt16LE(0) !== BIFF_BOF || bof.readUInt16LE(2) < 4) {
    return fail('not_spreadsheet');
  }

  if (bof.readUInt16LE(6) !== BOF_WORKBOOK_GLOBALS) return fail('corrupt');

  // Walk the workbook-globals substream (up to its EOF record).
  const sheetOffsets: number[] = [];
  let offset = 0;
  let sawEof = false;

  for (let guard = 0; guard < Math.floor(data.size / 4) + 1; guard += 1) {
    if (offset + 4 > data.size) return fail('corrupt');

    const head = await data.slice(offset, 4);
    const id = head.readUInt16LE(0);
    const length = head.readUInt16LE(2);

    if (length > XLS_LIMITS.maxRecordBytes) return fail('corrupt');
    if (offset + 4 + length > data.size) return fail('corrupt');

    if (id === BIFF_EOF) {
      sawEof = true;
      break;
    }

    if (id === BIFF_FILEPASS) return fail('encrypted');
    if (id === BIFF_OBPROJ) return fail('macro');

    if (id === BIFF_BOUNDSHEET) {
      if (length < 6) return fail('corrupt');

      const body = await data.slice(offset + 4, 6);
      const sheetType = body[5];

      // 1 = Excel 4.0 macro sheet, 6 = Visual Basic module.
      if (sheetType === 0x01 || sheetType === 0x06) return fail('macro');

      if (sheetOffsets.length >= XLS_LIMITS.maxSheets) return fail('corrupt');

      sheetOffsets.push(body.readUInt32LE(0));
    }

    offset += 4 + length;
  }

  if (!sawEof) return fail('corrupt');

  // A sheet is what ITS OWN header says, not only what the directory says.
  for (const position of sheetOffsets) {
    if (position + 8 > data.size) return fail('corrupt');

    const sheetBof = await data.slice(position, 8);

    if (sheetBof.readUInt16LE(0) !== BIFF_BOF) return fail('corrupt');

    const kind = sheetBof.readUInt16LE(6);

    if (kind === BOF_MACRO_SHEET || kind === BOF_VB_MODULE)
      return fail('macro');
    if (kind !== BOF_WORKSHEET && kind !== BOF_CHART) return fail('corrupt');
  }
}
