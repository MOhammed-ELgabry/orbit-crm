import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { CALENDAR_EVENT_STATUSES } from '../constants/calendar.constants';
import { trimId, trimToNull } from './calendar-event-transforms.util';

export class UpdateCalendarEventDto {
  @ApiPropertyOptional({
    example: 'Product demo with Acme Corp',
    description: 'Event title',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @ApiPropertyOptional({
    example: 'Walk through the Q4 roadmap and pricing.',
    nullable: true,
    description: 'Notes for this event. Pass null to clear it.',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'Meeting Room 2 / Zoom',
    nullable: true,
    description: 'Where the event takes place. Pass null to clear it.',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiPropertyOptional({
    example: '2026-10-01T13:00:00.000Z',
    description:
      'Start of the event (ISO 8601, UTC). Validated together with ' +
      'the event\u2019s (possibly unchanged) endAt/allDay — see ' +
      'CalendarService.',
  })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T14:00:00.000Z',
    description:
      'End of the event (ISO 8601, UTC). Validated together with the ' +
      'event\u2019s (possibly unchanged) startAt/allDay — see ' +
      'CalendarService.',
  })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Whether this is an all-day event. Validated together with the ' +
      'event\u2019s (possibly unchanged) startAt/endAt — see ' +
      'CalendarService.',
  })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({
    example: 'completed',
    description:
      'Event status. There is no separate complete/cancel endpoint \u2014 ' +
      'this field is how a caller marks an event complete, cancelled, ' +
      'or reopens it, matching how Task/Deal each use their own ' +
      'update endpoint for status changes.',
    enum: CALENDAR_EVENT_STATUSES,
  })
  @IsOptional()
  @IsIn(CALENDAR_EVENT_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    nullable: true,
    description:
      'ID of the contact this event is associated with. Must belong ' +
      'to the same company as the authenticated user. Pass null to ' +
      'clear it.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  contactId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    nullable: true,
    description:
      'ID of the lead this event is associated with. Must belong to ' +
      'the same company as the authenticated user. Pass null to ' +
      'clear it.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  leadId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123dealid',
    nullable: true,
    description:
      'ID of the deal this event is associated with. Must belong to ' +
      'the same company as the authenticated user. Pass null to ' +
      'clear it.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  dealId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    nullable: true,
    description:
      'ID of the user this event is assigned to. Must belong to the ' +
      'same company as the authenticated user. Pass null to unassign.',
  })
  @Transform(trimId)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  assignedToId?: string | null;
}