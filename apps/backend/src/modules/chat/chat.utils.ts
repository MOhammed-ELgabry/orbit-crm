import { randomUUID } from 'crypto';

/** Opaque primary keys for rows created with raw SQL. */
export function newChatId(): string {
  return randomUUID();
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
}

/**
 * Minimal, strict `Cookie` header parser (RFC 6265 `name=value; ...`).
 * Used by the WebSocket handshake, which does not pass through
 * cookie-parser. Values are only URI-decoded, never evaluated.
 */
export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header || header.length > 8192) return result;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;

    const name = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();

    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }

    if (name && !(name in result)) {
      try {
        result[name] = decodeURIComponent(value);
      } catch {
        result[name] = value;
      }
    }
  }

  return result;
}

/**
 * A transaction that lost a race and is safe to retry from the start:
 * the DB trigger's stale-epoch rejection (SQLSTATE 40001), a serialization
 * failure, a deadlock (40P01) or Prisma's write-conflict code (P2034).
 */
export function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown; message?: unknown } | null;
    cause?: unknown;
  };

  if (candidate.code === 'P2034') return true;

  const dbCode = candidate.meta?.code;
  if (dbCode === '40001' || dbCode === '40P01') return true;

  const text = [candidate.message, candidate.meta?.message]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');

  if (
    /\b40001\b|\b40P01\b|could not serialize|deadlock detected|team audience epoch is stale/i.test(
      text,
    )
  ) {
    return true;
  }

  return candidate.cause ? isRetryableTransactionError(candidate.cause) : false;
}

/** Unique-violation on a specific constraint, tolerant of driver shapes. */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown } | null;
    cause?: unknown;
  };

  if (candidate.code === 'P2002') return true;
  if (candidate.meta?.code === '23505') return true;

  if (
    typeof candidate.message === 'string' &&
    /\b23505\b|unique constraint|duplicate key value/i.test(candidate.message)
  ) {
    return true;
  }

  return candidate.cause ? isUniqueViolation(candidate.cause) : false;
}

/** Error class name only — never the message (it may carry user content). */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
