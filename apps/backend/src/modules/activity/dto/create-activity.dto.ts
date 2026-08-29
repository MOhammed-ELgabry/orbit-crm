import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { ACTIVITY_TYPES } from '../constants/activity.constants';

export class CreateActivityDto {
  @ApiProperty({
    example: 'CALL',
    description: 'Type of activity being logged',
    enum: ACTIVITY_TYPES,
  })
  @IsIn(ACTIVITY_TYPES)
  type: string;

  @ApiProperty({
    example: 'Follow-up call about renewal',
    description: 'Short title/subject for the activity',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({
    example:
      'Discussed pricing for the enterprise plan; sending a proposal by Friday.',
    description: 'Free-text details about the activity',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    example: '2026-08-25T14:30:00.000Z',
    description:
      'When the activity actually took place. Defaults to now if omitted (e.g. logging something as it happens).',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({
    example: 'cm123contact',
    description:
      'ID of the Contact this activity relates to. Must belong to the same company as the authenticated user.',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contactId?: string;
}
