/**
 * Response shapes of the contacts import endpoints. `index` is always the
 * position of the row inside the request's `rows` array; the frontend maps it
 * back to the row number in the user's file.
 */

export interface ContactImportRowIssue {
  /** Contact field the issue is about (e.g. "email"), or "row" for the row itself. */
  field: string;
  /**
   * Stable machine-readable code the frontend translates:
   * class-validator constraint names (isEmail, isLength, maxLength, isNotEmpty,
   * isString, isIn, isUrl, whitelistValidation), plus fieldNotAllowed,
   * saveFailed and unexpected.
   */
  code: string;
  /** English fallback message (never contains data from other rows or other companies). */
  message: string;
}

export type ContactImportValidateStatus = 'valid' | 'duplicate' | 'invalid';

export type ContactImportDuplicateReason =
  'existsInCompany' | 'duplicateInBatch';

export interface ContactImportValidateRow {
  index: number;
  status: ContactImportValidateStatus;
  errors: ContactImportRowIssue[];
  /** Non-blocking notes, e.g. "noEmail". */
  warnings: string[];
  duplicateReason?: ContactImportDuplicateReason;
}

export interface ContactImportValidateResult {
  rows: ContactImportValidateRow[];
  summary: { valid: number; duplicate: number; invalid: number };
}

export type ContactImportOutcome =
  'created' | 'duplicate' | 'invalid' | 'failed';

export interface ContactImportRowResult {
  index: number;
  outcome: ContactImportOutcome;
  errors: ContactImportRowIssue[];
  warnings: string[];
  /** Set only when outcome === 'created'. */
  contactId?: string;
}

export interface ContactImportResult {
  rows: ContactImportRowResult[];
  summary: {
    created: number;
    duplicate: number;
    invalid: number;
    failed: number;
  };
}
