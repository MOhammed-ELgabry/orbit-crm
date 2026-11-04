import { isAbsolute, normalize, parse } from 'node:path/posix';

import {
  ATTACHMENT_DEFAULTS,
  DB_CEILINGS,
  DEFAULT_STORAGE_DIR,
} from './chat-attachments.constants';

/**
 * Environment variables (all optional except the on/off switch):
 *
 *   CHAT_ATTACHMENTS_ENABLED            "true" turns the feature on. Anything
 *                                       else (unset, "false", "1", "TRUE"...)
 *                                       keeps it OFF.
 *   CHAT_ATTACHMENTS_DIR                absolute storage root (must already
 *                                       exist; the app never creates it).
 *   CHAT_ATTACHMENTS_IMAGE_MAX_BYTES    <= 5 MiB
 *   CHAT_ATTACHMENTS_PDF_MAX_BYTES      <= 10 MiB
 *   CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES  <= 10 MiB (.xlsx / .xls)
 *   CHAT_ATTACHMENTS_MAX_PENDING_PER_USER
 *   CHAT_ATTACHMENTS_MAX_DAILY_PER_USER
 *   CHAT_ATTACHMENTS_COMPANY_QUOTA_BYTES
 *   CHAT_ATTACHMENTS_GLOBAL_QUOTA_BYTES
 *   CHAT_ATTACHMENTS_MIN_FREE_BYTES
 *   CHAT_ATTACHMENTS_MAX_IMAGE_DIMENSION
 *   CHAT_ATTACHMENTS_MAX_IMAGE_PIXELS
 *   CHAT_ATTACHMENTS_MAX_CONCURRENT_UPLOADS
 *   CHAT_ATTACHMENTS_UPLOADING_TTL_MS
 *   CHAT_ATTACHMENTS_READY_TTL_MS
 *   CHAT_ATTACHMENTS_SWEEP_INTERVAL_MS  0 disables the in-process sweeper
 *   CHAT_ATTACHMENTS_SWEEP_BATCH_SIZE
 *
 * There is NO company allow-list or block-list: when the switch is on, the
 * feature is available to every company (tenant isolation is unchanged).
 */

export interface ChatAttachmentsLimits {
  imageMaxBytes: number;
  pdfMaxBytes: number;
  spreadsheetMaxBytes: number;
  maxPendingPerUser: number;
  maxDailyPerUser: number;
  companyQuotaBytes: number;
  globalQuotaBytes: number;
  minFreeBytes: number;
  maxImageDimension: number;
  maxImagePixels: number;
  maxConcurrentUploads: number;
  uploadingTtlMs: number;
  readyTtlMs: number;
  sweepIntervalMs: number;
  sweepBatchSize: number;
}

export type ChatAttachmentsConfig =
  | ({ enabled: true; storageDir: string } & ChatAttachmentsLimits)
  | {
      enabled: false;
      /** `flag_off` is normal; `invalid_config` is a deployment mistake. */
      reason: 'flag_off' | 'invalid_config';
      /** Names the offending variable(s) only, never their values. */
      detail?: string;
    };

type Env = Readonly<Record<string, string | undefined>>;

interface NumberRule {
  env: string;
  key: keyof ChatAttachmentsLimits;
  min: number;
  max: number;
}

const NUMBER_RULES: readonly NumberRule[] = [
  {
    env: 'CHAT_ATTACHMENTS_IMAGE_MAX_BYTES',
    key: 'imageMaxBytes',
    min: 1,
    max: DB_CEILINGS.imageBytes,
  },
  {
    env: 'CHAT_ATTACHMENTS_PDF_MAX_BYTES',
    key: 'pdfMaxBytes',
    min: 1,
    max: DB_CEILINGS.pdfBytes,
  },
  {
    env: 'CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES',
    key: 'spreadsheetMaxBytes',
    min: 1,
    max: DB_CEILINGS.spreadsheetBytes,
  },
  {
    env: 'CHAT_ATTACHMENTS_MAX_PENDING_PER_USER',
    key: 'maxPendingPerUser',
    min: 1,
    max: 50,
  },
  {
    env: 'CHAT_ATTACHMENTS_MAX_DAILY_PER_USER',
    key: 'maxDailyPerUser',
    min: 1,
    max: 10_000,
  },
  {
    env: 'CHAT_ATTACHMENTS_COMPANY_QUOTA_BYTES',
    key: 'companyQuotaBytes',
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  },
  {
    env: 'CHAT_ATTACHMENTS_GLOBAL_QUOTA_BYTES',
    key: 'globalQuotaBytes',
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  },
  {
    env: 'CHAT_ATTACHMENTS_MIN_FREE_BYTES',
    key: 'minFreeBytes',
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  },
  {
    env: 'CHAT_ATTACHMENTS_MAX_IMAGE_DIMENSION',
    key: 'maxImageDimension',
    min: 1,
    max: DB_CEILINGS.dimension,
  },
  {
    env: 'CHAT_ATTACHMENTS_MAX_IMAGE_PIXELS',
    key: 'maxImagePixels',
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  },
  {
    env: 'CHAT_ATTACHMENTS_MAX_CONCURRENT_UPLOADS',
    key: 'maxConcurrentUploads',
    min: 1,
    max: 64,
  },
  {
    env: 'CHAT_ATTACHMENTS_UPLOADING_TTL_MS',
    key: 'uploadingTtlMs',
    min: 10_000,
    max: 24 * 60 * 60 * 1000,
  },
  {
    env: 'CHAT_ATTACHMENTS_READY_TTL_MS',
    key: 'readyTtlMs',
    min: 60_000,
    max: 7 * 24 * 60 * 60 * 1000,
  },
  {
    env: 'CHAT_ATTACHMENTS_SWEEP_INTERVAL_MS',
    key: 'sweepIntervalMs',
    min: 0,
    max: 24 * 60 * 60 * 1000,
  },
  {
    env: 'CHAT_ATTACHMENTS_SWEEP_BATCH_SIZE',
    key: 'sweepBatchSize',
    min: 1,
    max: 5_000,
  },
];

function parseInteger(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,16}$/.test(raw.trim())) return null;

  const value = Number(raw.trim());

  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/**
 * A storage root must be an absolute path without traversal and must not be
 * the filesystem root itself.
 */
export function isAcceptableStorageDir(value: string): boolean {
  if (value.length === 0 || value.length > 1024 || value.includes('\0')) {
    return false;
  }

  if (!isAbsolute(value)) return false;
  if (value.split(/[\\/]+/).includes('..')) return false;

  const normalized = normalize(value);

  return normalized !== parse(normalized).root;
}

/**
 * Every variable this feature reads, so the module can hand exactly these to
 * the (pure) resolver and nothing else from the environment.
 */
export const CHAT_ATTACHMENTS_ENV_NAMES: readonly string[] = [
  'CHAT_ATTACHMENTS_ENABLED',
  'CHAT_ATTACHMENTS_DIR',
  ...NUMBER_RULES.map((rule) => rule.env),
];

/**
 * Turns the environment into a configuration. Pure and total: it never
 * throws, never touches the disk and fails CLOSED - any invalid value turns
 * the feature off (the rest of the application is unaffected) instead of
 * silently falling back to something looser.
 */
export function resolveChatAttachmentsConfig(env: Env): ChatAttachmentsConfig {
  if (env.CHAT_ATTACHMENTS_ENABLED?.trim() !== 'true') {
    return { enabled: false, reason: 'flag_off' };
  }

  const invalid: string[] = [];
  const limits: Record<string, number> = { ...ATTACHMENT_DEFAULTS };

  for (const rule of NUMBER_RULES) {
    const raw = env[rule.env];
    if (raw === undefined || raw.trim() === '') continue;

    const parsed = parseInteger(raw, rule.min, rule.max);

    if (parsed === null) {
      invalid.push(rule.env);
    } else {
      limits[rule.key] = parsed;
    }
  }

  const rawDir = env.CHAT_ATTACHMENTS_DIR;
  const storageDir =
    rawDir === undefined || rawDir.trim() === ''
      ? DEFAULT_STORAGE_DIR
      : rawDir.trim();

  if (!isAcceptableStorageDir(storageDir)) {
    invalid.push('CHAT_ATTACHMENTS_DIR');
  }

  if (invalid.length > 0) {
    return {
      enabled: false,
      reason: 'invalid_config',
      detail: invalid.join(', '),
    };
  }

  return {
    enabled: true,
    storageDir: normalize(storageDir),
    ...(limits as unknown as ChatAttachmentsLimits),
  };
}
