import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';

import { CONTACT_STATUSES } from '../constants/contact.constants';

export class CreateContactDto {
  @ApiProperty({
    example: 'John',
    description: 'Contact first name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  firstName: string;

  @ApiProperty({
    example: 'Smith',
    description: 'Contact last name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  lastName: string;

  @ApiPropertyOptional({
    example: 'john.smith@example.com',
    description: 'Contact email address',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: '+201001234567',
    description: 'Primary contact phone number',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string;

  @ApiPropertyOptional({
    example: '+201101234567',
    description: 'Secondary/mobile contact number',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(6, 30)
  mobile?: string;

  @ApiPropertyOptional({
    example: 'Sales Manager',
    description: 'Contact job title',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  @ApiPropertyOptional({
    example: 'Acme Corporation',
    description: 'Organization associated with the contact',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string;

  @ApiPropertyOptional({
    example: 'https://example.com',
    description: 'Contact or organization website',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({
    example: '123 Main Street',
    description: 'Contact street address',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({
    example: 'Cairo',
    description: 'Contact city',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 'Cairo',
    description: 'Contact state or governorate',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({
    example: 'Egypt',
    description: 'Contact country',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({
    example: '11511',
    description: 'Contact postal code',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({
    example: 'Interested in our premium CRM plan.',
    description: 'Internal notes about the contact',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    example: 'website',
    description: 'Source where the contact originated',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional({
    example: 'active',
    description: 'Contact lifecycle status',
    enum: CONTACT_STATUSES,
  })
  @IsOptional()
  @IsIn(CONTACT_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description:
      'ID of the user this contact is assigned to. Must belong to the same company as the authenticated user.',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string;
}
