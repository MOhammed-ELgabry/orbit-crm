import type { TFunction } from "i18next";

import type {
  DerivedImportRow,
  ImportField,
  ImportIssue,
  ImportRowKind,
} from "../../../types/contactImport";

export const importFieldLabelKey = (field: ImportField): string =>
  `contactsImportField_${field}`;

/** Localized text of one validation/import problem; falls back to the server's English message. */
export function issueMessage(t: TFunction, issue: ImportIssue): string {
  const field = (
    issue.field in FIELD_KEYS
      ? t(importFieldLabelKey(issue.field as ImportField))
      : issue.field
  ) as string;

  return t(`contactsImportIssue_${issue.code}`, {
    field,
    defaultValue: issue.message,
  });
}

const FIELD_KEYS: Record<string, true> = {
  firstName: true,
  lastName: true,
  fullName: true,
  email: true,
  phone: true,
  mobile: true,
  jobTitle: true,
  organizationName: true,
  website: true,
  address: true,
  city: true,
  state: true,
  country: true,
  postalCode: true,
  notes: true,
  source: true,
  status: true,
};

export const rowKindLabelKey = (kind: ImportRowKind): string =>
  `contactsImportKind_${kind}`;

/** Why a row is not (or not yet) imported, as one readable sentence. Empty for good rows. */
export function rowReason(t: TFunction, row: DerivedImportRow): string {
  if (row.kind === "duplicate") {
    return row.duplicateReason === "duplicateInFile" ||
      row.duplicateReason === "duplicateInBatch"
      ? (t("contactsImportDuplicate_duplicateInFile", {
          row: row.duplicateOfRow ?? "",
        }) as string)
      : (t("contactsImportDuplicate_existsInCompany") as string);
  }

  if (row.kind === "invalid" || row.kind === "failed") {
    return row.issues.map((issue) => issueMessage(t, issue)).join(" · ");
  }

  return "";
}
