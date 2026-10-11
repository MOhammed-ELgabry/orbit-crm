import { BadRequestException } from '@nestjs/common';

import {
  CALENDAR_DATE_PATTERN,
  MAX_REPORT_RANGE_DAYS,
} from '../constants/report.constants';

const MS_PER_DAY = 86_400_000;

/**
 * Parses a YYYY-MM-DD string as a REAL calendar day (so 2026-02-30 is
 * rejected rather than silently rolled into March) and returns it as a
 * UTC-midnight day number. Only used for day arithmetic (ordering and
 * span); the actual time-zone-aware boundaries are computed by PostgreSQL.
 */
export function parseCalendarDay(value: string, field: string): number {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${field} is not a valid calendar date.`);
  }

  return date.getTime() / MS_PER_DAY;
}

/**
 * Validates an inclusive [from, to] day range: both real dates, from <= to
 * and at most MAX_REPORT_RANGE_DAYS days long.
 */
export function assertValidPeriod(from: string, to: string): void {
  const fromDay = parseCalendarDay(from, 'from');
  const toDay = parseCalendarDay(to, 'to');

  if (fromDay > toDay) {
    throw new BadRequestException('from must not be after to.');
  }

  const inclusiveDays = toDay - fromDay + 1;

  if (inclusiveDays > MAX_REPORT_RANGE_DAYS) {
    throw new BadRequestException(
      `The date range may span at most ${MAX_REPORT_RANGE_DAYS} days.`,
    );
  }
}
