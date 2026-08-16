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

import { CONTACT_STATUSES } from '../constants/contact.constants';

export class ContactQueryDto {
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
    example: 'Mohammed',
    description:
      'Search by first name, last name, email, phone, mobile, or organization name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field used for sorting',
    enum: [
      'firstName',
      'lastName',
      'email',
      'organizationName',
      'createdAt',
      'updatedAt',
      'status',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'firstName',
    'lastName',
    'email',
    'organizationName',
    'createdAt',
    'updatedAt',
    'status',
  ])
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
    example: 'active',
    description: 'Filter contacts by status',
    enum: CONTACT_STATUSES,
  })
  @IsOptional()
  @IsIn(CONTACT_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description: 'Filter contacts assigned to a specific user',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({
    example: 'id,firstName,lastName,email,phone,status',
    description: 'Comma-separated list of fields to return',
  })
  @IsOptional()
  @IsString()
  fields?: string;
}
