export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

/**
 * Longest date range a report accepts, in calendar days (inclusive).
 * Bounds the work any single request can ask the database to do. Reports
 * are read-only aggregates over rows that already have a
 * (companyId, createdAt/dueDate) access path, so this is a guard-rail
 * against pathological ranges, not a performance tuning knob.
 */
export const MAX_REPORT_RANGE_DAYS = 366;

/** How many individual lead sources the Leads Overview lists before the rest are rolled into one "other" bucket. */
export const MAX_LEAD_SOURCES_LISTED = 10;

/**
 * IANA names that browsers (notably Chromium, via ICU) still report but
 * that a PostgreSQL build without the tz "backward" links does not
 * recognise — e.g. Debian/Ubuntu packages that moved them to
 * `tzdata-legacy`. Only consulted when the name the browser sent is
 * missing from the database's own list, and only to map it to the
 * canonical zone with identical rules; it never widens what is accepted
 * beyond real zones.
 */
export const LEGACY_TIMEZONE_ALIASES: Readonly<Record<string, string>> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Dacca': 'Asia/Dhaka',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
};

/** Shape check for an IANA zone id before it ever reaches the database. */
export const IANA_TIMEZONE_PATTERN =
  /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

export const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
