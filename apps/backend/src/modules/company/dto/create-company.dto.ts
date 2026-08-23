import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';

import { BUSINESS_TYPES } from '../constants/business-type.constants';
import type { BusinessType } from '../constants/business-type.constants';

export class CreateCompanyDto {
  @ApiProperty({
    example: 'Orbit Technology',
    description: 'Company name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({
    example: 'info@orbitcrm.com',
    description: 'Company contact email address',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    example: '+201001234567',
    description: 'Company phone number',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @ApiPropertyOptional({
    example: '123 Nile Street, Cairo, Egypt',
    description: 'Company address',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(5, 255)
  address?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.orbitcrm.com/logos/orbit.png',
    description: 'Company logo URL',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsUrl()
  logo?: string;

  @ApiPropertyOptional({
    example: 'https://orbitcrm.com',
    description: 'Company website',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({
    example: 'TX-123456789',
    description: 'Company tax number',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(3, 50)
  taxNumber?: string;

  @ApiPropertyOptional({
    example: 'Orbit CRM provides ERP and CRM solutions.',
    description: 'Company description',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    example: 'real_estate',
    enum: BUSINESS_TYPES,
    description:
      'Business type, normally set once via the onboarding ' +
      'POST /auth/business-type step rather than here.',
  })
  @IsOptional()
  @IsIn(BUSINESS_TYPES)
  businessType?: BusinessType;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Company active status',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}