/**
 * Chat attachments (MVP): images (PNG / JPEG / WebP), PDF and Excel
 * workbooks (.xlsx / .xls) in DIRECT conversations. Everything tunable lives in chat-attachments.config.ts; this
 * file only holds the fixed rules and the defaults.
 */

export const CHAT_ATTACHMENTS_CONFIG = Symbol('CHAT_ATTACHMENTS_CONFIG');
export const CHAT_ATTACHMENTS_STORAGE = Symbol('CHAT_ATTACHMENTS_STORAGE');
export const CHAT_ATTACHMENTS_REPOSITORY = Symbol(
  'CHAT_ATTACHMENTS_REPOSITORY',
);

/** Name of the multipart field that carries the file. */
export const CHAT_ATTACHMENT_FIELD = 'file';

export const ATTACHMENT_KINDS = ['IMAGE', 'PDF', 'SPREADSHEET'] as const;
export type ChatAttachmentKindName = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_STATUSES = [
  'UPLOADING',
  'READY',
  'ATTACHED',
  'EXPIRED',
] as const;
export type ChatAttachmentStatusName = (typeof ATTACHMENT_STATUSES)[number];

export const IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export const PDF_CONTENT_TYPE = 'application/pdf';

/** `.xlsx` (Open XML workbook) and `.xls` (BIFF workbook). No macro formats. */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLS_CONTENT_TYPE = 'application/vnd.ms-excel';
export const SPREADSHEET_CONTENT_TYPES = [
  XLSX_CONTENT_TYPE,
  XLS_CONTENT_TYPE,
] as const;

export type ChatAttachmentContentType =
  | (typeof IMAGE_CONTENT_TYPES)[number]
  | typeof PDF_CONTENT_TYPE
  | (typeof SPREADSHEET_CONTENT_TYPES)[number];

/**
 * Ceilings enforced by CHECK constraints in the database migration
 * (20261030120000_add_chat_attachments; the spreadsheet ceiling by
 * 20261102120100_chat_attachments_spreadsheet_checks). The environment can LOWER the
 * limits but never raise them above these values; a larger value is treated
 * as an invalid configuration (the feature then stays off).
 */
export const DB_CEILINGS = {
  imageBytes: 5 * 1024 * 1024,
  pdfBytes: 10 * 1024 * 1024,
  spreadsheetBytes: 10 * 1024 * 1024,
  dimension: 65_535,
} as const;

const MIB = 1024 * 1024;

export const DEFAULT_STORAGE_DIR = '/var/lib/orbit-crm/chat-attachments';

/** Initial values (all of them can be overridden from the environment). */
export const ATTACHMENT_DEFAULTS = {
  imageMaxBytes: 5 * MIB,
  pdfMaxBytes: 10 * MIB,
  spreadsheetMaxBytes: 10 * MIB,
  maxPendingPerUser: 3,
  maxDailyPerUser: 30,
  companyQuotaBytes: 500 * MIB,
  /** Hard cap over every company together (shared VPS disk). */
  globalQuotaBytes: 2048 * MIB,
  /** An upload is refused when the free space would fall below this. */
  minFreeBytes: 1024 * MIB,
  maxImageDimension: 10_000,
  maxImagePixels: 40_000_000,
  /** Uploads being received at the same moment in this process. */
  maxConcurrentUploads: 4,
  /** Row reserved (UPLOADING) but the file is not complete yet. */
  uploadingTtlMs: 15 * 60 * 1000,
  /** Uploaded and checked (READY) but not sent in a message yet. */
  readyTtlMs: 2 * 60 * 60 * 1000,
  /** Sweeper period. 0 disables the in-process timer. */
  sweepIntervalMs: 5 * 60 * 1000,
  /** Maximum rows / files handled by ONE sweeper run. */
  sweepBatchSize: 200,
} as const;

/**
 * Rows that were never attached are not claimed the instant they expire:
 * a request that is finishing right now must not lose its file.
 */
export const SWEEP_GRACE_MS = 60 * 1000;

/**
 * EXPIRED rows are kept this long (the "30 uploads a day" limit counts rows
 * of the last 24 h) and are deleted afterwards. ATTACHED rows are never
 * deleted by the application.
 */
export const EXPIRED_ROW_RETENTION_MS = 48 * 60 * 60 * 1000;

/** A leftover `.part` file older than this is removed by the sweeper. */
export const STALE_TEMP_MAX_AGE_MS = 60 * 60 * 1000;

/** Name of the temporary directory inside the storage root. */
export const TEMP_DIR_NAME = '.tmp';

/** One storage-key segment (see the CHECK constraint in the migration). */
export const STORAGE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Company ids are used as the first storage-key segment. */
export const COMPANY_ID_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Stable machine-readable error tokens. The API error body carries only the
 * `message`, so the client maps these tokens to translated text; they never
 * contain user data.
 */
export const ATTACHMENT_ERRORS = {
  disabled: 'attachments_disabled',
  notFound: 'attachment_not_found',
  directOnly: 'attachment_direct_only',
  empty: 'attachment_empty',
  unsupportedType: 'attachment_unsupported_type',
  corrupt: 'attachment_corrupt',
  tooLarge: 'attachment_too_large',
  dimensions: 'attachment_dimensions',
  pdfEncrypted: 'attachment_pdf_encrypted',
  pdfActiveContent: 'attachment_pdf_active_content',
  typeMismatch: 'attachment_type_mismatch',
  spreadsheetMacro: 'attachment_spreadsheet_macro',
  spreadsheetEncrypted: 'attachment_spreadsheet_encrypted',
  spreadsheetActiveContent: 'attachment_spreadsheet_active_content',
  quotaPending: 'attachment_quota_pending',
  quotaDaily: 'attachment_quota_daily',
  quotaCompany: 'attachment_quota_company',
  quotaGlobal: 'attachment_quota_global',
  busy: 'attachment_busy',
  storageUnavailable: 'attachment_storage_unavailable',
  fileUnavailable: 'attachment_file_unavailable',
  expired: 'attachment_expired',
  notReady: 'attachment_not_ready',
  alreadyUsed: 'attachment_already_used',
  invalidUpload: 'attachment_invalid_upload',
} as const;
