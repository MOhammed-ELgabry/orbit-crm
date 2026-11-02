import { isAxiosError } from "axios";

import type { ChatAttachmentConfig, ChatAttachmentKind } from "../types/chat";

/**
 * Client-side mirror of the attachment rules. A convenience only: it saves a
 * pointless upload and gives an immediate message. The server re-checks the
 * real content (magic bytes, structure, sizes) on every upload, and trusts
 * neither the name, nor the MIME type, nor the size reported here.
 */

export const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf";

const MIB = 1024 * 1024;
export const FALLBACK_IMAGE_MAX_BYTES = 5 * MIB;
export const FALLBACK_PDF_MAX_BYTES = 10 * MIB;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

/** Kind of a picked file by its declared type/extension (a hint only). */
export function guessAttachmentKind(file: {
  name: string;
  type: string;
}): ChatAttachmentKind | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (IMAGE_TYPES.includes(type)) return "IMAGE";
  if (type === "application/pdf") return "PDF";

  // Some systems report an empty type: fall back to the extension.
  if (type === "") {
    if (IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))) return "IMAGE";
    if (name.endsWith(".pdf")) return "PDF";
  }

  return null;
}

export type AttachmentFileCheck =
  | { ok: true; kind: ChatAttachmentKind }
  | { ok: false; reason: "unsupported" | "empty" | "too_large" };

export function checkAttachmentFile(
  file: { name: string; type: string; size: number },
  config: Extract<ChatAttachmentConfig, { enabled: true }> | null,
): AttachmentFileCheck {
  const kind = guessAttachmentKind(file);

  if (!kind) return { ok: false, reason: "unsupported" };
  if (file.size <= 0) return { ok: false, reason: "empty" };

  const max =
    kind === "IMAGE"
      ? (config?.imageMaxBytes ?? FALLBACK_IMAGE_MAX_BYTES)
      : (config?.pdfMaxBytes ?? FALLBACK_PDF_MAX_BYTES);

  if (file.size > max) return { ok: false, reason: "too_large" };

  return { ok: true, kind };
}

/** "1.4 MB" - binary units, one decimal at most. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const text =
    value >= 10 || Number.isInteger(value)
      ? Math.round(value).toString()
      : value.toFixed(1);

  return `${text} ${units[unit]}`;
}

/** Stable error tokens returned by the server (`message`). */
const SERVER_TOKEN_TO_KEY: Record<string, string> = {
  attachments_disabled: "chatAttachmentErrDisabled",
  attachment_not_found: "chatAttachmentUnavailable",
  attachment_direct_only: "chatAttachmentErrDirectOnly",
  attachment_empty: "chatAttachmentErrEmpty",
  attachment_unsupported_type: "chatAttachmentErrUnsupported",
  attachment_corrupt: "chatAttachmentErrCorrupt",
  attachment_too_large: "chatAttachmentErrTooLarge",
  attachment_dimensions: "chatAttachmentErrDimensions",
  attachment_pdf_encrypted: "chatAttachmentErrPdfEncrypted",
  attachment_pdf_active_content: "chatAttachmentErrPdfActive",
  attachment_quota_pending: "chatAttachmentErrQuotaPending",
  attachment_quota_daily: "chatAttachmentErrQuotaDaily",
  attachment_quota_company: "chatAttachmentErrStorageFull",
  attachment_quota_global: "chatAttachmentErrStorageFull",
  attachment_busy: "chatAttachmentErrBusy",
  attachment_storage_unavailable: "chatAttachmentErrStorage",
  attachment_file_unavailable: "chatAttachmentUnavailable",
  attachment_expired: "chatAttachmentErrExpired",
  attachment_not_ready: "chatAttachmentErrNotReady",
  attachment_already_used: "chatAttachmentErrUsed",
  attachment_invalid_upload: "chatAttachmentErrInvalid",
};

export interface AttachmentFailure {
  /** i18n key of the message to show. */
  key: string;
  /** Trying the SAME file again might work (network, busy, server error). */
  retryable: boolean;
}

/**
 * Turns a failed upload / download into a user message. `status` and `token`
 * come from the HTTP response (undefined status = no response: network).
 */
export function describeAttachmentFailure(
  status: number | undefined,
  token: string | undefined,
): AttachmentFailure {
  if (status === undefined) {
    return { key: "chatAttachmentErrNetwork", retryable: true };
  }

  const mapped = token ? SERVER_TOKEN_TO_KEY[token] : undefined;

  if (mapped) {
    const retryable =
      token === "attachment_busy" || token === "attachment_storage_unavailable";
    return { key: mapped, retryable };
  }

  if (status === 413)
    return { key: "chatAttachmentErrTooLarge", retryable: false };
  if (status === 429) return { key: "chatAttachmentErrBusy", retryable: true };
  if (status === 401 || status === 408 || status >= 500) {
    return { key: "chatAttachmentErrGeneric", retryable: true };
  }

  return { key: "chatAttachmentErrGeneric", retryable: false };
}

/** Failure of an HTTP call (upload, download, cancel) as a user message. */
export function failureOf(error: unknown): AttachmentFailure {
  if (!isAxiosError(error)) {
    return describeAttachmentFailure(undefined, undefined);
  }

  const data: unknown = error.response?.data;
  const message =
    data && typeof data === "object" && "message" in data
      ? (data as { message: unknown }).message
      : undefined;

  return describeAttachmentFailure(
    error.response?.status,
    typeof message === "string" ? message : undefined,
  );
}
