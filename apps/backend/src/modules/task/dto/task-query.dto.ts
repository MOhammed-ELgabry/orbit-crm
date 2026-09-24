import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  TASK_PRIORITIES,
  TASK_SORTABLE_FIELDS,
  TASK_STATUSES,
} from '../constants/task.constants';

export class TaskQueryDto {
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
    description: 'Search by task title or description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    example: 'dueDate',
    description: 'Field used for sorting',
    enum: TASK_SORTABLE_FIELDS,
  })
  @IsOptional()
  @IsString()
  @IsIn(TASK_SORTABLE_FIELDS)
  sortBy?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    example: 'asc',
    description: 'Sorting direction',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 'todo',
    description: 'Filter tasks by status',
    enum: TASK_STATUSES,
  })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'high',
    description: 'Filter tasks by priority',
    enum: TASK_PRIORITIES,
  })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description: 'Filter tasks assigned to a specific user',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    description: 'Filter tasks associated with a specific contact',
  })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    description: 'Filter tasks associated with a specific lead',
  })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional({
    example: 'cm123dealid',
    description: 'Filter tasks associated with a specific deal',
  })
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiPropertyOptional({
    example: 'id,title,status,priority,dueDate',
    description: 'Comma-separated list of fields to return',
  })
  @IsOptional()
  @IsString()
  fields?: string;
}
