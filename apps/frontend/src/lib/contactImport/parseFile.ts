import Papa from "papaparse";

import type {
  ImportEncoding,
  ImportFileFormat,
  ParsedImportFile,
} from "../../types/contactImport";

/** Limits of the approved plan. Whole-file rejection: nothing is partially read. */
export const IMPORT_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxRows: 1000,
  maxColumns: 50,
} as const;

/** An .xlsx is a zip: refuse files that would expand to something absurd. */
const MAX_UNCOMPRESSED_XLSX_BYTES = 50 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 2000;

export type ImportFileErrorCode =
  | "unsupportedType"
  | "legacyXls"
  | "tooLarge"
  | "empty"
  | "noRows"
  | "tooManyRows"
  | "tooManyColumns"
  | "invalidXlsx"
  | "invalidCsv"
  | "invalidEncoding"
  | "readFailed";

export class ImportFileError extends Error {
  readonly code: ImportFileErrorCode;
  /** Number to show in the message (the limit that was exceeded). */
  readonly limit?: number;

  constructor(code: ImportFileErrorCode, limit?: number) {
    super(code);
    this.name = "ImportFileError";
    this.code = code;
    this.limit = limit;
  }
}

export interface ParseImportFileOptions {
  /** CSV only. When omitted UTF-8 is used (and a non-UTF-8 file is reported, never guessed). */
  encoding?: ImportEncoding;
}

type RawCell = string | number | boolean | Date | null | undefined;

const hasText = (value: string) => value.trim().length > 0;

/** Reads the bytes of a File (older test DOMs have no Blob.arrayBuffer). */
async function readFileBytes(file: File): Promise<Uint8Array> {
  try {
    if (typeof file.arrayBuffer === "function") {
      return new Uint8Array(await file.arrayBuffer());
    }

    return await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  } catch {
    throw new ImportFileError("readFailed");
  }
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

/**
 * Reads and validates a user file (.csv or .xlsx) entirely in the browser.
 * Nothing is uploaded: the server only ever receives the already-parsed rows.
 */
export async function parseImportFile(
  file: File,
  options: ParseImportFileOptions = {},
): Promise<ParsedImportFile> {
  const extension = extensionOf(file.name);

  if (extension === "xls") {
    throw new ImportFileError("legacyXls");
  }

  if (extension !== "csv" && extension !== "xlsx") {
    throw new ImportFileError("unsupportedType");
  }

  if (file.size === 0) {
    throw new ImportFileError("empty");
  }

  if (file.size > IMPORT_LIMITS.maxBytes) {
    throw new ImportFileError("tooLarge", IMPORT_LIMITS.maxBytes);
  }

  const bytes = await readFileBytes(file);

  // Content must match the extension: a renamed file is not trusted.
  const isZip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const isLegacyXls = startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);

  if (isLegacyXls) {
    throw new ImportFileError("legacyXls");
  }

  if (extension === "xlsx") {
    if (!isZip) {
      throw new ImportFileError("invalidXlsx");
    }

    return parseXlsx(file.name, bytes);
  }

  if (isZip) {
    throw new ImportFileError("unsupportedType");
  }

  return parseCsv(file.name, bytes, options.encoding);
}

/* ---------------------------------- CSV ---------------------------------- */

function decodeCsv(
  bytes: Uint8Array,
  requested: ImportEncoding | undefined,
): { text: string; encoding: ImportEncoding } {
  // UTF-16 text exports ("Unicode Text" from Excel) always carry a BOM.
  if (startsWith(bytes, [0xff, 0xfe])) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes),
      encoding: "utf-8",
    };
  }

  if (startsWith(bytes, [0xfe, 0xff])) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes),
      encoding: "utf-8",
    };
  }

  const encoding = requested ?? "utf-8";

  try {
    // fatal: an invalid UTF-8 byte sequence is reported, never replaced by "�".
    const text = new TextDecoder(encoding, {
      fatal: encoding === "utf-8",
    }).decode(bytes);

    return { text, encoding };
  } catch {
    throw new ImportFileError("invalidEncoding");
  }
}

const DELIMITER_CANDIDATES = [",", ";", "\t", "|"] as const;

/** Number of `delimiter` characters in a line, ignoring the ones inside "quoted" text. */
function countDelimiter(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;

  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) count++;
  }

  return count;
}

/**
 * Picks the delimiter that splits the first lines into the same (largest)
 * number of columns. Decided here rather than by the CSV library because a
 * two-column file with a trailing newline is not detected reliably by it.
 */
function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 10);

  if (lines.length === 0) {
    return ",";
  }

  let best: string = ",";
  let bestScore = -1;
  let bestCount = 0;

  for (const delimiter of DELIMITER_CANDIDATES) {
    const headerCount = countDelimiter(lines[0], delimiter);

    if (headerCount === 0) continue;

    // How many of the first lines have the same number of columns as the header.
    const score = lines.filter(
      (line) => countDelimiter(line, delimiter) === headerCount,
    ).length;

    if (score > bestScore || (score === bestScore && headerCount > bestCount)) {
      best = delimiter;
      bestScore = score;
      bestCount = headerCount;
    }
  }

  return best;
}

function parseCsv(
  fileName: string,
  bytes: Uint8Array,
  requestedEncoding: ImportEncoding | undefined,
): ParsedImportFile {
  const { text, encoding } = decodeCsv(bytes, requestedEncoding);

  const result = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: false,
  });

  // An unterminated quote would silently swallow the rest of the file into one cell.
  if (result.errors.some((error) => error.code === "MissingQuotes")) {
    throw new ImportFileError("invalidCsv");
  }

  const table = finalizeTable(
    result.data.map((row) => row.map((cell) => String(cell ?? "").trim())),
    new Set<number>(),
  );

  return {
    fileName,
    format: "csv" as ImportFileFormat,
    ...table,
    encoding,
    delimiter: result.meta.delimiter,
  };
}

/* ---------------------------------- XLSX ---------------------------------- */

/** Reads the zip central directory and refuses suspicious expansion sizes. */
function assertZipIsSafe(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // End Of Central Directory record: scan backwards (it may be followed by a comment).
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);

  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }

  if (eocd < 0) {
    throw new ImportFileError("invalidXlsx");
  }

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  if (entries > MAX_XLSX_ENTRIES) {
    throw new ImportFileError("invalidXlsx");
  }

  let total = 0;

  for (let i = 0; i < entries; i++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    ) {
      throw new ImportFileError("invalidXlsx");
    }

    total += view.getUint32(offset + 24, true);

    if (total > MAX_UNCOMPRESSED_XLSX_BYTES) {
      throw new ImportFileError("tooLarge", IMPORT_LIMITS.maxBytes);
    }

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function cellToText(cell: RawCell): string {
  if (cell === null || cell === undefined) {
    return "";
  }

  if (typeof cell === "string") {
    return cell.trim();
  }

  if (typeof cell === "number") {
    // Plain digits, never "1e+21" (phones/zip codes stored as numbers).
    return Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  }

  if (typeof cell === "boolean") {
    return cell ? "TRUE" : "FALSE";
  }

  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const iso = cell.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }

  return "";
}

async function parseXlsx(
  fileName: string,
  bytes: Uint8Array,
): Promise<ParsedImportFile> {
  assertZipIsSafe(bytes);

  let sheets: Array<{ sheet: string; data: RawCell[][] }>;

  try {
    // Loaded on demand: the library is only paid for when someone imports an .xlsx.
    const { default: readExcelFile } =
      await import("read-excel-file/universal");
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    sheets = (await readExcelFile(buffer)) as typeof sheets;
  } catch {
    throw new ImportFileError("invalidXlsx");
  }

  // First sheet that actually has something in it.
  const chosen = sheets.find((s) =>
    s.data.some((row) => row.some((cell) => hasText(cellToText(cell)))),
  );

  if (!chosen) {
    throw new ImportFileError("empty");
  }

  const numericColumns = new Set<number>();
  const table = chosen.data.map((row) =>
    row.map((cell, column) => {
      if (typeof cell === "number") {
        numericColumns.add(column);
      }

      return cellToText(cell);
    }),
  );

  return {
    fileName,
    format: "xlsx" as ImportFileFormat,
    ...finalizeTable(table, numericColumns),
    sheetName: chosen.sheet,
  };
}

/* ------------------------------ shared shaping ------------------------------ */

/**
 * Turns a raw table (array of rows of text) into headers + data rows:
 * blank rows are dropped (row numbers of the rest are kept), the first
 * non-blank row is the header, and the file limits are enforced.
 */
function finalizeTable(
  table: string[][],
  numericColumns: Set<number>,
): Pick<
  ParsedImportFile,
  "headers" | "rows" | "rowNumbers" | "numericColumns"
> {
  const isBlank = (row: string[]) => row.every((cell) => !hasText(cell));

  const indexed = table
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => !isBlank(row));

  if (indexed.length === 0) {
    throw new ImportFileError("empty");
  }

  const [header, ...data] = indexed;

  if (data.length === 0) {
    throw new ImportFileError("noRows");
  }

  if (data.length > IMPORT_LIMITS.maxRows) {
    throw new ImportFileError("tooManyRows", IMPORT_LIMITS.maxRows);
  }

  // Width = last column that holds anything (Excel sheets often have empty trailing columns).
  let width = 0;
  for (const { row } of indexed) {
    for (let column = row.length - 1; column >= width; column--) {
      if (hasText(row[column])) {
        width = column + 1;
        break;
      }
    }
  }

  if (width > IMPORT_LIMITS.maxColumns) {
    throw new ImportFileError("tooManyColumns", IMPORT_LIMITS.maxColumns);
  }

  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, column) => row[column] ?? "");

  return {
    headers: pad(header.row),
    rows: data.map(({ row }) => pad(row)),
    rowNumbers: data.map(({ rowNumber }) => rowNumber),
    numericColumns: [...numericColumns].filter((column) => column < width),
  };
}
