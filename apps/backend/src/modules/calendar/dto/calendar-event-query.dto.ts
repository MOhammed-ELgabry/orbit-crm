import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CALENDAR_EVENT_STATUSES } from '../constants/calendar.constants';
import { trimId } from './calendar-event-transforms.util';

/**
 * Deliberately not built on the shared PaginationQueryDto/
 * PrismaQueryBuilder that Contact/Lead/Deal/Task/Activity all use.
 * Those exist for page-based, optionally-searched, optionally-sorted
 * lists; Calendar's list is always bounded to a specific date range
 * with a fixed sort order (startAt, id) that the caller can't change —
 * see CalendarEventRepository.findAll for exactly why the range is
 * expressed the way it is. Reusing the generic builder here would mean
 * bending its page/search/sort shape to fit a query it was not built
 * for, not actually sharing more logic.
 */
export class CalendarEventQueryDto {
  @ApiProperty({
    example: '2026-10-01T00:00:00.000Z',
    description:
      'Start of the visible range (ISO 8601, UTC, inclusive of any ' +
      'event still in progress at this instant).',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    example: '2026-11-01T00:00:00.000Z',
    description:
      'End of the visible range (ISO 8601, UTC, exclusive). Must be ' +
      'after from; the gap between them may not exceed ' +
      'CALENDAR_MAX_QUERY_RANGE_DAYS.',
  })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({
    example: 'scheduled',
    description: 'Filter to a single status.',
    enum: CALENDAR_EVENT_STATUSES,
  })
  @IsOptional()
  @IsIn(CALENDAR_EVENT_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description: 'Filter to events assigned to this user.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  assignedToId?: string;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    description: 'Filter to events associated with this contact.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  contactId?: string;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    description: 'Filter to events associated with this lead.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  leadId?: string;

  @ApiPropertyOptional({
    example: 'cm123dealid',
    description: 'Filter to events associated with this deal.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  dealId?: string;
}
