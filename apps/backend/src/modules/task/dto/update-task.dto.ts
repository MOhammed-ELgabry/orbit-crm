import { ApiPropertyOptional } from '@nestjs/swagger';
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

import { TASK_PRIORITIES, TASK_STATUSES } from '../constants/task.constants';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    example: 'Call customer about renewal',
    description: 'Task title',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @ApiPropertyOptional({
    example: 'Confirm the new seat count before sending the quote.',
    description: 'What needs to be done',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    example: 'in_progress',
    description:
      'Task status. Also used for marking a task complete/cancelled — ' +
      'there is no separate complete/cancel endpoint, matching how Deal ' +
      'uses its own update endpoint for stage (won/lost) changes.',
    enum: TASK_STATUSES,
  })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'high',
    description: 'Task priority',
    enum: TASK_PRIORITIES,
  })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({
    example: '2026-12-01',
    nullable: true,
    description: 'Due date (ISO 8601). Pass null to clear it.',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    nullable: true,
    description:
      'ID of the contact this task is associated with. Must belong to ' +
      'the same company as the authenticated user. Pass null to clear it.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contactId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    nullable: true,
    description:
      'ID of the lead this task is associated with. Must belong to the ' +
      'same company as the authenticated user. Pass null to clear it.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  leadId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123dealid',
    nullable: true,
    description:
      'ID of the deal this task is associated with. Must belong to the ' +
      'same company as the authenticated user. Pass null to clear it.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dealId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    nullable: true,
    description:
      'ID of the user this task is assigned to. Must belong to the ' +
      'same company as the authenticated user. Pass null to unassign.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string | null;
}
