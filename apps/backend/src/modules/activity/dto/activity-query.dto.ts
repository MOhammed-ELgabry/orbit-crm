import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ACTIVITY_SORTABLE_FIELDS,
  ACTIVITY_TYPES,
} from '../constants/activity.constants';

export class ActivityQueryDto {
  @ApiPropertyOptional({
    type: Number,
    example: 1,
    description: 'Page number',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: Number,
    example: 20,
    description: 'Number of items per page',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    example: 'renewal',
    description: 'Search by activity title or description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    example: 'occurredAt',
    description: 'Field used for sorting',
    enum: ACTIVITY_SORTABLE_FIELDS,
  })
  @IsOptional()
  @IsString()
  @IsIn(ACTIVITY_SORTABLE_FIELDS)
  sortBy?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    example: 'desc',
    description: 'Sorting direction',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 'CALL',
    description: 'Filter by activity type',
    enum: ACTIVITY_TYPES,
  })
  @IsOptional()
  @IsIn(ACTIVITY_TYPES)
  type?: string;

  @ApiPropertyOptional({
    example: 'cm123contact',
    description:
      'Return only activities associated with this contact (e.g. a Contact timeline)',
  })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({
    example: '2026-08-01T00:00:00.000Z',
    description: 'Only include activities that occurred on or after this date',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-08-31T23:59:59.000Z',
    description: 'Only include activities that occurred on or before this date',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    example: 'id,type,title,occurredAt',
    description: 'Comma-separated list of fields to return',
  })
  @IsOptional()
  @IsString()
  fields?: string;
}
