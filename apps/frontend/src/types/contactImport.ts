/**
 * Types of the Contacts Import feature (Excel/CSV -> contacts).
 *
 * The server types at the bottom mirror
 * backend/src/modules/contact/contact-import.types.ts. Keep them in sync by
 * hand (there is no shared-types package between the two apps).
 */

/** Contact fields a file column can be mapped to. `fullName` is a helper: it is split into firstName/lastName. */
export const IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "mobile",
  "jobTitle",
  "organizationName",
  "website",
  "address",
  "city",
  "state",
  "country",
  "postalCode",
  "notes",
  "source",
  "status",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Fields that exist on the Contact itself (everything except the fullName helper). */
export type ImportContactField = Exclude<ImportField, "fullName">;

/** Index = column index in the file; value = target field, or null to ignore the column. */
export type ColumnMapping = Array<ImportField | null>;

/** How a "full name" cell is split. */
export type NameSplitMode = "lastWord" | "firstWord";

export type ImportEncoding = "utf-8" | "windows-1256" | "windows-1252";

export type ImportFileFormat = "csv" | "xlsx";

export interface ParsedImportFile {
  fileName: string;
  format: ImportFileFormat;
  headers: string[];
  /** Data rows (without the header), every row padded to `headers.length`. */
  rows: string[][];
  /** 1-based row number of each data row inside the user's file/sheet. */
  rowNumbers: number[];
  encoding?: ImportEncoding;
  delimiter?: string;
  sheetName?: string;
  /** Columns that held real numbers in the sheet (xlsx only): leading zeros may be lost there. */
  numericColumns: number[];
}

/** One row ready to be validated/sent, built from the file + the chosen mapping. */
export interface ImportRowDraft {
  /** 1-based row number in the user's file. Unique per file. */
  rowNumber: number;
  values: Partial<Record<ImportContactField, string>>;
  /** firstName/lastName were derived from a full-name column (shown to the user, editable). */
  nameFromFullName: boolean;
  /** The original full-name cell, when nameFromFullName is true. */
  fullName?: string;
}

export interface ImportIssue {
  field: string;
  code: string;
  message: string;
}

export type ImportCheckStatus = "unchecked" | "valid" | "duplicate" | "invalid";

export type ImportOutcome = "created" | "duplicate" | "invalid" | "failed";

export type ImportDuplicateReason =
  "existsInCompany" | "duplicateInBatch" | "duplicateInFile";

/** Everything the page knows about one row. */
export interface ImportRowState {
  draft: ImportRowDraft;
  /** Result of the latest server dry-run. */
  check: ImportCheckStatus;
  checkIssues: ImportIssue[];
  checkWarnings: string[];
  checkDuplicateReason?: ImportDuplicateReason;
  /** Result of the real import (undefined until the row was sent). */
  outcome?: ImportOutcome;
  outcomeIssues: ImportIssue[];
}

/** What a row means right now, after combining dry-run, in-file duplicates and the import result. */
export type ImportRowKind =
  "unchecked" | "valid" | "duplicate" | "invalid" | "created" | "failed";

export interface DerivedImportRow {
  rowNumber: number;
  draft: ImportRowDraft;
  kind: ImportRowKind;
  issues: ImportIssue[];
  warnings: string[];
  duplicateReason?: ImportDuplicateReason;
  /** For duplicateInFile: the first row that uses the same email. */
  duplicateOfRow?: number;
}

export interface ImportCounts {
  total: number;
  created: number;
  /** Skipped because the email already exists (in Orbit or earlier in the file). */
  skipped: number;
  /** Rejected because the data is not valid. */
  rejected: number;
  /** Valid, but saving failed (can be retried). */
  failed: number;
  /** Valid and still waiting to be imported / not checked yet. */
  pending: number;
}

/* ------------------------------ server contract ------------------------------ */

export type ImportRequestRow = Partial<Record<ImportContactField, string>>;

export interface ImportValidateRowResult {
  index: number;
  status: "valid" | "duplicate" | "invalid";
  errors: ImportIssue[];
  warnings: string[];
  duplicateReason?: "existsInCompany" | "duplicateInBatch";
}

export interface ImportValidateResponse {
  rows: ImportValidateRowResult[];
  summary: { valid: number; duplicate: number; invalid: number };
}

export interface ImportRowResult {
  index: number;
  outcome: ImportOutcome;
  errors: ImportIssue[];
  warnings: string[];
  contactId?: string;
}

export interface ImportResponse {
  rows: ImportRowResult[];
  summary: {
    created: number;
    duplicate: number;
    invalid: number;
    failed: number;
  };
}
