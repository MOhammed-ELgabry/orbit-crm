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

import { TASK_PRIORITIES, TASK_STATUSES } from '../constants/task.constants';

export class CreateTaskDto {
  @ApiProperty({
    example: 'Call customer about renewal',
    description: 'Task title',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Length(2, 200)
  title: string;

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
    example: 'todo',
    description: 'Task status. Defaults to "todo" when omitted.',
    enum: TASK_STATUSES,
  })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'medium',
    description: 'Task priority. Defaults to "medium" when omitted.',
    enum: TASK_PRIORITIES,
  })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Due date (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    description:
      'ID of the contact this task is associated with. Must belong to ' +
      'the same company as the authenticated user.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contactId?: string;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    description:
      'ID of the lead this task is associated with. Must belong to ' +
      'the same company as the authenticated user.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  leadId?: string;

  @ApiPropertyOptional({
    example: 'cm123dealid',
    description:
      'ID of the deal this task is associated with. Must belong to ' +
      'the same company as the authenticated user.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dealId?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description:
      'ID of the user this task is assigned to. Must belong to the ' +
      'same company as the authenticated user.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string;
}
