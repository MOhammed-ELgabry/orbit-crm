import { deflateRawSync } from 'node:zlib';

/**
 * Synthetic spreadsheet bytes for tests. Everything is built in memory from
 * scratch (no real workbook, no customer data): a minimal OPC/ZIP package for
 * `.xlsx` and a minimal compound file with BIFF records for `.xls`. They have
 * the STRUCTURE the inspector checks, nothing more - they are not meant to be
 * opened in Excel.
 */

// --- CRC-32 (ZIP) ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table: number[] = [];

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;

    table.push(c >>> 0);
  }

  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
}

// --- ZIP writer -------------------------------------------------------------

export interface ZipFixtureEntry {
  name: string;
  data: Buffer | string;
  /** Deflate the data (default: stored). */
  deflate?: boolean;
  /** General purpose flags (bit 0 = encrypted). */
  flags?: number;
  /** Written in the local header instead of `name` (name-confusion tests). */
  localName?: string;
  /** Written in the central directory instead of the real method. */
  method?: number;
}

export interface ZipFixtureOptions {
  comment?: Buffer;
  /** Bytes appended after the end record. */
  trailing?: Buffer;
  /** Bytes written before the first local header. */
  prefix?: Buffer;
}

export function makeZip(
  entries: ZipFixtureEntry[],
  options: ZipFixtureOptions = {},
): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = options.prefix?.length ?? 0;

  if (options.prefix) parts.push(options.prefix);

  for (const entry of entries) {
    const raw = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data);
    const body = entry.deflate ? deflateRawSync(raw) : raw;
    const method = entry.method ?? (entry.deflate ? 8 : 0);
    const flags = entry.flags ?? 0;
    const name = Buffer.from(entry.name, 'latin1');
    const localName = Buffer.from(entry.localName ?? entry.name, 'latin1');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(localName.length, 26);

    parts.push(local, localName, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    directory.push(central, name);
    offset += local.length + localName.length + body.length;
  }

  const directoryBytes = Buffer.concat(directory);
  const comment = options.comment ?? Buffer.alloc(0);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);

  return Buffer.concat([
    ...parts,
    directoryBytes,
    end,
    comment,
    options.trailing ?? Buffer.alloc(0),
  ]);
}

// --- .xlsx ------------------------------------------------------------------

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLS_MIME = 'application/vnd.ms-excel';

const MAIN_TYPE = `${XLSX_MIME}.main+xml`;

export function contentTypesXml(workbookType: string = MAIN_TYPE): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${workbookType}"/>` +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  );
}

export interface XlsxFixtureOptions {
  /** Replaces the whole `[Content_Types].xml`. */
  contentTypes?: string;
  /** Extra parts (name -> content). */
  extraParts?: Record<string, string | Buffer>;
  /** Parts to leave out. */
  omit?: string[];
  /** Deflate `[Content_Types].xml` (default true, like real files). */
  deflateContentTypes?: boolean;
  zip?: ZipFixtureOptions;
}

export function makeXlsx(options: XlsxFixtureOptions = {}): Buffer {
  const parts: Record<string, string | Buffer> = {
    '[Content_Types].xml': options.contentTypes ?? contentTypesXml(),
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    'xl/workbook.xml': '<workbook/>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData/></worksheet>',
    ...options.extraParts,
  };

  for (const name of options.omit ?? []) delete parts[name];

  return makeZip(
    Object.entries(parts).map(([name, data]) => ({
      name,
      data,
      deflate:
        name === '[Content_Types].xml'
          ? options.deflateContentTypes !== false
          : false,
    })),
    options.zip,
  );
}

// --- .xls -------------------------------------------------------------------

const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;

function record(id: number, body: Buffer = Buffer.alloc(0)): Buffer {
  const head = Buffer.alloc(4);

  head.writeUInt16LE(id, 0);
  head.writeUInt16LE(body.length, 2);

  return Buffer.concat([head, body]);
}

function bofRecord(substream: number): Buffer {
  const body = Buffer.alloc(16);

  body.writeUInt16LE(0x0600, 0); // BIFF8
  body.writeUInt16LE(substream, 2);

  return record(0x0809, body);
}

export interface BiffFixtureOptions {
  /** Sheet types as written in BOUNDSHEET (0 worksheet, 1 macro, 6 VB). */
  boundsheetTypes?: number[];
  /** What the sheet's OWN BOF says (default 0x0010 = worksheet). */
  sheetBofKinds?: number[];
  filepass?: boolean;
  obproj?: boolean;
  /** Pad with zeros up to this many bytes (regular streams need >= 4096). */
  padTo?: number;
}

export function makeWorkbookStream(options: BiffFixtureOptions = {}): Buffer {
  const types = options.boundsheetTypes ?? [0];
  const kinds = options.sheetBofKinds ?? types.map(() => 0x0010);

  const sheetStreams = kinds.map((kind) =>
    Buffer.concat([bofRecord(kind), record(0x000a)]),
  );

  const globalsFor = (offsets: number[]): Buffer => {
    const records: Buffer[] = [bofRecord(0x0005)];

    if (options.filepass) records.push(record(0x002f, Buffer.alloc(6)));
    if (options.obproj) records.push(record(0x00d3, Buffer.alloc(4)));

    types.forEach((type, index) => {
      const name = Buffer.from(`Sheet${index + 1}`, 'latin1');
      const body = Buffer.alloc(8 + name.length);

      body.writeUInt32LE(offsets[index] ?? 0, 0);
      body[4] = 0;
      body[5] = type;
      body[6] = name.length;
      body[7] = 0;
      name.copy(body, 8);

      records.push(record(0x0085, body));
    });

    records.push(record(0x000a));

    return Buffer.concat(records);
  };

  const globalsLength = globalsFor(types.map(() => 0)).length;
  const offsets: number[] = [];
  let position = globalsLength;

  for (const stream of sheetStreams) {
    offsets.push(position);
    position += stream.length;
  }

  const stream = Buffer.concat([globalsFor(offsets), ...sheetStreams]);

  return stream.length >= (options.padTo ?? 0)
    ? stream
    : Buffer.concat([
        stream,
        Buffer.alloc((options.padTo ?? 0) - stream.length),
      ]);
}

export interface DirectoryFixtureEntry {
  name: string;
  /** 1 storage, 2 stream. */
  type: 1 | 2;
}

export interface XlsFixtureOptions extends BiffFixtureOptions {
  /** Raw workbook stream (replaces the generated BIFF). */
  stream?: Buffer;
  /** Name of the workbook stream (default "Workbook"). */
  streamName?: string | null;
  /** Additional empty storages / streams in the directory. */
  extraEntries?: DirectoryFixtureEntry[];
  /** Keep the workbook in the mini stream (stream < 4096 bytes). */
  mini?: boolean;
}

function directoryEntry(
  name: string,
  type: number,
  start: number,
  size: number,
  next: number,
  child = FREESECT,
): Buffer {
  const entry = Buffer.alloc(128);
  const nameBytes = Buffer.from(name, 'utf16le');

  nameBytes.copy(entry, 0);
  entry.writeUInt16LE(nameBytes.length + 2, 64);
  entry[66] = type;
  entry[67] = 1;
  entry.writeUInt32LE(FREESECT, 68);
  entry.writeUInt32LE(next, 72);
  entry.writeUInt32LE(child, 76);
  entry.writeUInt32LE(start, 116);
  entry.writeUInt32LE(size, 120);

  return entry;
}

export function makeXls(options: XlsFixtureOptions = {}): Buffer {
  const mini = options.mini === true;
  const stream =
    options.stream ??
    makeWorkbookStream({
      ...options,
      padTo: mini ? 0 : (options.padTo ?? 4096),
    });

  const entries: DirectoryFixtureEntry[] = [
    ...(options.streamName === null
      ? []
      : [{ name: options.streamName ?? 'Workbook', type: 2 as const }]),
    ...(options.extraEntries ?? []),
  ];

  // Sector plan: 0 = FAT, then directory sectors, then data sectors.
  const directoryCount = Math.ceil((entries.length + 1) / 4);
  const fat: number[] = [FATSECT];
  const sectors: Buffer[] = [Buffer.alloc(0)]; // placeholder for the FAT

  const directorySectorIds: number[] = [];

  for (let index = 0; index < directoryCount; index += 1) {
    directorySectorIds.push(sectors.length);
    sectors.push(Buffer.alloc(512));
  }

  directorySectorIds.forEach((id, index) => {
    fat[id] = index === directorySectorIds.length - 1 ? ENDOFCHAIN : id + 1;
  });

  const pad = (buffer: Buffer, unit: number) =>
    Buffer.concat([
      buffer,
      Buffer.alloc((unit - (buffer.length % unit)) % unit),
    ]);

  let workbookStart = ENDOFCHAIN;
  let rootStart = ENDOFCHAIN;
  let rootSize = 0;
  let miniFatSector = ENDOFCHAIN;

  const addChain = (data: Buffer): number => {
    const padded = pad(data, 512);
    const first = sectors.length;
    const count = Math.max(1, padded.length / 512);

    for (let index = 0; index < count; index += 1) {
      const id = sectors.length;

      sectors.push(
        padded.subarray(index * 512, (index + 1) * 512).length === 512
          ? padded.subarray(index * 512, (index + 1) * 512)
          : Buffer.alloc(512),
      );
      fat[id] = index === count - 1 ? ENDOFCHAIN : id + 1;
    }

    return first;
  };

  if (mini) {
    const miniPadded = pad(stream, 64);
    const miniCount = miniPadded.length / 64;
    const table = Buffer.alloc(512, 0xff);

    for (let index = 0; index < miniCount; index += 1) {
      table.writeUInt32LE(
        index === miniCount - 1 ? ENDOFCHAIN : index + 1,
        index * 4,
      );
    }

    miniFatSector = addChain(table);
    rootStart = addChain(miniPadded);
    rootSize = miniPadded.length;
    workbookStart = 0;
  } else {
    workbookStart = addChain(stream);
  }

  // FAT sector.
  const fatSector = Buffer.alloc(512, 0xff);

  fat.forEach((value, index) =>
    fatSector.writeUInt32LE(value >>> 0, index * 4),
  );
  sectors[0] = fatSector;

  // Directory.
  const directory: Buffer[] = [
    directoryEntry(
      'Root Entry',
      5,
      rootStart,
      rootSize,
      FREESECT,
      entries.length > 0 ? 1 : FREESECT,
    ),
  ];

  entries.forEach((entry, index) => {
    const isWorkbook = index === 0 && options.streamName !== null;
    const next = index === entries.length - 1 ? FREESECT : index + 2;

    directory.push(
      directoryEntry(
        entry.name,
        entry.type,
        isWorkbook ? workbookStart : ENDOFCHAIN,
        isWorkbook ? stream.length : 0,
        next,
      ),
    );
  });

  const directoryBytes = Buffer.concat([
    ...directory,
    Buffer.alloc(directoryCount * 512 - directory.length * 128),
  ]);

  directorySectorIds.forEach((id, index) => {
    sectors[id] = directoryBytes.subarray(index * 512, (index + 1) * 512);
  });

  // Header.
  const header = Buffer.alloc(512, 0);

  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(3, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44); // one FAT sector
  header.writeUInt32LE(directorySectorIds[0], 48);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(miniFatSector, 60);
  header.writeUInt32LE(miniFatSector === ENDOFCHAIN ? 0 : 1, 64);
  header.writeUInt32LE(ENDOFCHAIN, 68);
  header.writeUInt32LE(0, 72);
  header.writeUInt32LE(0, 76); // DIFAT[0] = FAT sector 0

  for (let slot = 1; slot < 109; slot += 1)
    header.writeUInt32LE(FREESECT, 76 + slot * 4);

  return Buffer.concat([header, ...sectors]);
}

/** A file that starts with the compound-file magic but is not a workbook. */
export function makeNonWorkbookCompoundFile(streamName: string): Buffer {
  return makeXls({ streamName, stream: Buffer.alloc(4096) });
}
