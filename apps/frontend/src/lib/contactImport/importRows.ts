import { CONTACT_STATUSES } from "../../types/contact";
import type {
  ColumnMapping,
  DerivedImportRow,
  ImportContactField,
  ImportCounts,
  ImportRequestRow,
  ImportRowDraft,
  ImportRowState,
  NameSplitMode,
  ParsedImportFile,
} from "../../types/contactImport";
import { columnTitle } from "./columnMapping";

/**
 * Size of one request to the import endpoints. The backend accepts at most
 * 100 rows; the byte cap keeps a request well under Express' default 100 KB
 * JSON body limit (so the API needs no special configuration).
 */
export const IMPORT_REQUEST_LIMITS = {
  maxRows: 100,
  maxBytes: 80_000,
} as const;

/* ------------------------------ building rows ------------------------------ */

/**
 * Splits a full name into first/last name.
 * - "lastWord":  "Mohamed Ali Hassan" -> first "Mohamed Ali", last "Hassan"
 * - "firstWord": "Mohamed Ali Hassan" -> first "Mohamed",     last "Ali Hassan"
 * A single word becomes the first name and leaves the last name empty, so the
 * row is flagged for the user to fix (nothing is invented).
 */
export function splitFullName(
  fullName: string,
  mode: NameSplitMode,
): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return { firstName: words[0] ?? "", lastName: "" };
  }

  if (mode === "firstWord") {
    return { firstName: words[0], lastName: words.slice(1).join(" ") };
  }

  return {
    firstName: words.slice(0, -1).join(" "),
    lastName: words[words.length - 1],
  };
}

/** Maps a status written in the file to the canonical value when it matches (any letter case). */
function normalizeStatus(value: string): string {
  const lower = value.trim().toLowerCase();
  return CONTACT_STATUSES.find((status) => status === lower) ?? value.trim();
}

/**
 * Builds one draft per data row using the chosen column mapping.
 * A full-name cell is only used when the row has neither a first nor a last
 * name of its own, so a value from the file is never overwritten.
 */
export function buildImportRows(
  parsed: ParsedImportFile,
  mapping: ColumnMapping,
  options: { splitMode: NameSplitMode },
): ImportRowDraft[] {
  return parsed.rows.map((cells, rowIndex) => {
    const values: Partial<Record<ImportContactField, string>> = {};
    let fullName = "";

    mapping.forEach((field, column) => {
      const cell = (cells[column] ?? "").trim();

      if (field === null || cell.length === 0) {
        return;
      }

      if (field === "fullName") {
        fullName = cell;
      } else {
        values[field] = field === "status" ? normalizeStatus(cell) : cell;
      }
    });

    let nameFromFullName = false;

    if (fullName && !values.firstName && !values.lastName) {
      const { firstName, lastName } = splitFullName(
        fullName,
        options.splitMode,
      );

      if (firstName) values.firstName = firstName;
      if (lastName) values.lastName = lastName;
      nameFromFullName = true;
    }

    return {
      rowNumber: parsed.rowNumbers[rowIndex],
      values,
      nameFromFullName,
      fullName: nameFromFullName ? fullName : undefined,
    };
  });
}

/** Applies a manual correction of the name (shown in the preview, validated again by the server). */
export function updateDraftName(
  draft: ImportRowDraft,
  patch: { firstName?: string; lastName?: string },
): ImportRowDraft {
  const values = { ...draft.values };

  for (const key of ["firstName", "lastName"] as const) {
    const next = patch[key]?.trim();

    if (next === undefined) {
      continue;
    }

    if (next.length > 0) {
      values[key] = next;
    } else {
      delete values[key];
    }
  }

  return { ...draft, values };
}

/** Only non-empty values are sent (the backend treats missing = not provided). */
export function toRequestRow(draft: ImportRowDraft): ImportRequestRow {
  const row: ImportRequestRow = {};

  for (const [key, value] of Object.entries(draft.values)) {
    if (typeof value === "string" && value.trim().length > 0) {
      row[key as ImportContactField] = value.trim();
    }
  }

  return row;
}

export function createRowState(draft: ImportRowDraft): ImportRowState {
  return {
    draft,
    check: "unchecked",
    checkIssues: [],
    checkWarnings: [],
    outcomeIssues: [],
  };
}

/* ----------------------------- combining results ----------------------------- */

const emailKey = (draft: ImportRowDraft): string | null => {
  const email = draft.values.email?.trim().toLowerCase();
  return email ? email : null;
};

/**
 * Combines the dry-run, the import result and a client-side check for the
 * same email appearing twice in the file into what each row means now.
 *
 * "Same email earlier in the file" is decided here, from the CURRENT rows,
 * not taken from the server: that way editing a row never leaves a stale
 * duplicate verdict on another row.
 */
export function deriveRows(states: ImportRowState[]): DerivedImportRow[] {
  const firstRowByEmail = new Map<string, number>();

  return states.map((state) => {
    const { draft } = state;
    let kind: DerivedImportRow["kind"];
    let issues = state.checkIssues;
    let duplicateReason = state.checkDuplicateReason;

    if (state.outcome) {
      kind = state.outcome;
      issues = state.outcomeIssues;
      duplicateReason = undefined;
    } else if (state.check === "duplicate") {
      if (duplicateReason === "duplicateInBatch") {
        // Re-decided below from the current rows.
        kind = "valid";
        duplicateReason = undefined;
      } else {
        kind = "duplicate";
      }
    } else {
      kind = state.check;
    }

    const email = emailKey(draft);
    let duplicateOfRow: number | undefined;

    if (email) {
      const first = firstRowByEmail.get(email);

      if (first !== undefined && kind === "valid") {
        kind = "duplicate";
        duplicateReason = "duplicateInFile";
        duplicateOfRow = first;
      } else if (
        first === undefined &&
        (kind === "valid" ||
          kind === "duplicate" ||
          kind === "created" ||
          kind === "failed")
      ) {
        firstRowByEmail.set(email, draft.rowNumber);
      }
    }

    return {
      rowNumber: draft.rowNumber,
      draft,
      kind,
      issues,
      warnings: state.checkWarnings,
      duplicateReason,
      duplicateOfRow,
    };
  });
}

export function countRows(rows: DerivedImportRow[]): ImportCounts {
  const counts: ImportCounts = {
    total: rows.length,
    created: 0,
    skipped: 0,
    rejected: 0,
    failed: 0,
    pending: 0,
  };

  for (const row of rows) {
    if (row.kind === "created") counts.created++;
    else if (row.kind === "duplicate") counts.skipped++;
    else if (row.kind === "invalid") counts.rejected++;
    else if (row.kind === "failed") counts.failed++;
    else counts.pending++;
  }

  return counts;
}

/* --------------------------------- batching --------------------------------- */

const encoder = new TextEncoder();

/** Splits items into requests of at most `maxRows` rows and `maxBytes` of JSON. */
export function chunkRows<T>(
  items: T[],
  limits: { maxRows: number; maxBytes: number } = IMPORT_REQUEST_LIMITS,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const bytes = encoder.encode(JSON.stringify(item)).length + 1;

    if (
      current.length > 0 &&
      (current.length >= limits.maxRows ||
        currentBytes + bytes > limits.maxBytes)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(item);
    currentBytes += bytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/* ------------------------------- error report ------------------------------- */

/**
 * CSV Formula Injection guard (OWASP): a cell that starts with = + - @ or a
 * tab/carriage return would be executed as a formula by Excel/Sheets, so it
 * is prefixed with an apostrophe. Applied to EVERY cell of the report, since
 * the cells come from a file the user got from somewhere else.
 */
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface ErrorReportLabels {
  row: string;
  status: string;
  reason: string;
}

/** Byte-order mark: lets Excel open the Arabic text of the report correctly. */
const UTF8_BOM = String.fromCharCode(0xfeff);

export const ERROR_REPORT_KINDS = ["invalid", "duplicate", "failed"] as const;

/**
 * The user's original rows that were not imported, with the row number, the
 * status and the reason appended, so the file can be fixed and imported again.
 * UTF-8 with BOM so Excel opens Arabic text correctly.
 */
export function buildErrorReportCsv(
  parsed: ParsedImportFile,
  rows: DerivedImportRow[],
  describe: (row: DerivedImportRow) => { status: string; reason: string },
  labels: ErrorReportLabels,
): string {
  const indexByRowNumber = new Map(
    parsed.rowNumbers.map((rowNumber, index) => [rowNumber, index]),
  );

  const lines: string[] = [
    [
      ...parsed.headers.map((header, column) => columnTitle(header, column)),
      labels.row,
      labels.status,
      labels.reason,
    ]
      .map(escapeCsvCell)
      .join(","),
  ];

  for (const row of rows) {
    if (!(ERROR_REPORT_KINDS as readonly string[]).includes(row.kind)) {
      continue;
    }

    const original =
      parsed.rows[indexByRowNumber.get(row.rowNumber) ?? -1] ?? [];
    const { status, reason } = describe(row);

    lines.push(
      [
        ...parsed.headers.map((_, column) => original[column] ?? ""),
        String(row.rowNumber),
        status,
        reason,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
