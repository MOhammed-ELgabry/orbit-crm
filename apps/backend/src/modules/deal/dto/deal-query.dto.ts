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

import { DEAL_SORTABLE_FIELDS, DEAL_STAGES } from '../constants/deal.constants';

export class DealQueryDto {
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
    example: 'Acme',
    description: 'Search by deal title or notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field used for sorting',
    enum: DEAL_SORTABLE_FIELDS,
  })
  @IsOptional()
  @IsString()
  @IsIn(DEAL_SORTABLE_FIELDS)
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
    example: 'negotiation',
    description: 'Filter deals by pipeline stage',
    enum: DEAL_STAGES,
  })
  @IsOptional()
  @IsIn(DEAL_STAGES)
  stage?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description: 'Filter deals assigned to a specific user',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    description: 'Filter deals associated with a specific contact',
  })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    description: 'Filter deals originating from a specific lead',
  })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional({
    example: 'id,title,amount,stage,expectedCloseDate',
    description: 'Comma-separated list of fields to return',
  })
  @IsOptional()
  @IsString()
  fields?: string;
}