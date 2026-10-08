import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { trimId, trimToNull } from './calendar-event-transforms.util';

export class CreateCalendarEventDto {
  @ApiProperty({
    example: 'Product demo with Acme Corp',
    description: 'Event title',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Length(2, 200)
  title: string;

  @ApiPropertyOptional({
    example: 'Walk through the Q4 roadmap and pricing.',
    description: 'Notes for this event',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'Meeting Room 2 / Zoom',
    description: 'Where the event takes place',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiProperty({
    example: '2026-10-01T13:00:00.000Z',
    description:
      'Start of the event (ISO 8601, UTC). For an all-day event this ' +
      'must be exact UTC midnight.',
  })
  @IsDateString()
  startAt: string;

  @ApiProperty({
    example: '2026-10-01T14:00:00.000Z',
    description:
      'End of the event (ISO 8601, UTC) — must be after startAt. For ' +
      'an all-day event this is an EXCLUSIVE end date and must also be ' +
      'exact UTC midnight, so a single-day all-day event has endAt = ' +
      'startAt + 1 day.',
  })
  @IsDateString()
  endAt: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Whether this is an all-day event. Defaults to false when omitted.',
  })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    description:
      'ID of the contact this event is associated with. Must belong ' +
      'to the same company as the authenticated user.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  contactId?: string;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    description:
      'ID of the lead this event is associated with. Must belong to ' +
      'the same company as the authenticated user.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  leadId?: string;

  @ApiPropertyOptional({
    example: 'cm123dealid',
    description:
      'ID of the deal this event is associated with. Must belong to ' +
      'the same company as the authenticated user.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  dealId?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description:
      'ID of the user this event is assigned to. Must belong to the ' +
      'same company as the authenticated user.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  assignedToId?: string;
}
