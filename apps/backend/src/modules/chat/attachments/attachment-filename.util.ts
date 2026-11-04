import type { ChatAttachmentContentType } from './chat-attachments.constants';

/**
 * File names are DISPLAY text only. They are never used to build a path
 * (the storage key is random) and never trusted as a type indicator.
 */

const MAX_NAME_CODE_POINTS = 120;
const FALLBACK_NAME = 'attachment';

const EXTENSIONS: Record<ChatAttachmentContentType, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-excel': ['xls'],
};

const CANONICAL_EXTENSION: Record<ChatAttachmentContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
};

/**
 * Multipart parsers decode the `filename` parameter as latin1 by default, so
 * a UTF-8 name ("فاتورة.pdf") arrives as mojibake. When every character fits
 * in one byte and the bytes form valid UTF-8, the real name is recovered;
 * otherwise the value is kept as it came.
 */
export function repairLatin1Utf8(value: string): string {
  if (!/[\u0080-\u00ff]/.test(value)) return value;

  for (const char of value) {
    if (char.codePointAt(0)! > 0xff) return value;
  }

  const decoded = Buffer.from(value, 'latin1').toString('utf8');

  return decoded.includes('\uFFFD') ? value : decoded;
}

/** Removes everything that could be misleading or dangerous in a name. */
export function sanitizeDisplayName(original: string | undefined): string {
  if (typeof original !== 'string') return FALLBACK_NAME;

  let name = repairLatin1Utf8(original).normalize('NFC');

  // Only the last path component counts (some browsers send a full path).
  name = name.split(/[\\/]/).pop() ?? '';

  name = name
    // line breaks and tabs become a plain space (so "a\nb" stays readable)
    .replace(/[\t\n\r\v\f]+/g, ' ')
    // control characters, bidi overrides/isolates, zero-width characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // no hidden files / relative markers
    .replace(/^\.+/, '')
    .trim();

  const points = Array.from(name);

  if (points.length > MAX_NAME_CODE_POINTS) {
    name = points.slice(0, MAX_NAME_CODE_POINTS).join('').trim();
  }

  return name.length > 0 ? name : FALLBACK_NAME;
}

/**
 * Makes the visible extension agree with what the file REALLY is, so a
 * download called "invoice.pdf" is a PDF and "photo.png" is a PNG.
 */
export function withExtensionFor(
  name: string,
  contentType: ChatAttachmentContentType,
): string {
  const dot = name.lastIndexOf('.');
  const current = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';

  if (EXTENSIONS[contentType].includes(current)) return name;

  const base =
    dot > 0 && /^[a-z0-9]{1,5}$/i.test(current) ? name.slice(0, dot) : name;

  return `${base}.${CANONICAL_EXTENSION[contentType]}`;
}

/** ASCII-only rendition for the legacy `filename=` parameter. */
function asciiFallback(name: string): string {
  const ascii = name
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;%]/g, '_')
    .trim();

  return ascii.length > 0 ? ascii : FALLBACK_NAME;
}

/**
 * `Content-Disposition` for a stored attachment. The file name is encoded
 * (RFC 6266 / 5987), so it can never inject a header or a parameter.
 */
export function contentDispositionFor(
  disposition: 'inline' | 'attachment',
  displayName: string,
): string {
  const encoded = encodeURIComponent(displayName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${asciiFallback(displayName)}"; filename*=UTF-8''${encoded}`;
}
