import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { LEAD_STATUSES } from '../constants/lead.constants';

export class UpdateLeadDto {
  @ApiPropertyOptional({
    example: 'John',
    description: 'Lead first name',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 100)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Smith',
    description: 'Lead last name',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 100)
  lastName?: string;

  @ApiPropertyOptional({
    example: 'john.smith@example.com',
    description: 'Lead email address',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: '+201001234567',
    description: 'Lead phone number',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string;

  @ApiPropertyOptional({
    example: 'Acme Corporation',
    description: 'Organization associated with the lead',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string;

  @ApiPropertyOptional({
    example: 'website',
    description: 'Source where the lead originated',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional({
    example: 'contacted',
    description: 'Lead lifecycle status',
    enum: LEAD_STATUSES,
  })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'Interested in our premium CRM plan.',
    description: 'Internal notes about the lead',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    nullable: true,
    description:
      'ID of the user this lead is assigned to. Must belong to the same company as the authenticated user. Pass null to unassign.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string | null;
}
