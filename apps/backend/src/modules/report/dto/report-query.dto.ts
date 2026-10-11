import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

import {
  CALENDAR_DATE_PATTERN,
  IANA_TIMEZONE_PATTERN,
} from '../constants/report.constants';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Query string shared by every report. `companyId` is deliberately NOT a
 * field: the tenant always comes from the verified access token, and the
 * global ValidationPipe (forbidNonWhitelisted) rejects any extra query key.
 *
 * This DTO only checks SHAPE. Whether the dates are real calendar days,
 * whether from <= to, the maximum span and whether the zone exists are
 * checked by ReportService / the repository, where they can produce
 * precise 400 messages.
 */
export class ReportPeriodQueryDto {
  @ApiProperty({
    example: '2026-10-01',
    description:
      'First day of the range, inclusive, as a calendar date (YYYY-MM-DD) in `timezone`.',
  })
  @Transform(trim)
  @IsString()
  @Matches(CALENDAR_DATE_PATTERN, { message: 'from must be YYYY-MM-DD.' })
  from!: string;

  @ApiProperty({
    example: '2026-10-31',
    description:
      'Last day of the range, inclusive, as a calendar date (YYYY-MM-DD) in `timezone`.',
  })
  @Transform(trim)
  @IsString()
  @Matches(CALENDAR_DATE_PATTERN, { message: 'to must be YYYY-MM-DD.' })
  to!: string;

  @ApiProperty({
    example: 'Africa/Cairo',
    description:
      "The viewer's IANA time zone (e.g. from Intl.DateTimeFormat().resolvedOptions().timeZone). Day boundaries are computed in this zone, including DST transitions.",
  })
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  @Matches(IANA_TIMEZONE_PATTERN, {
    message: 'timezone must be an IANA time zone name such as Africa/Cairo.',
  })
  timezone!: string;
}
