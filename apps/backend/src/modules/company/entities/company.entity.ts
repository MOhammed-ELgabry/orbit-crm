import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { ICompany } from '../interfaces/company.interface';

export class CompanyEntity implements ICompany {
  @ApiProperty({
    example: 'cmf8m3v8j0000l704q9i8v4bx',
    description: 'Unique company identifier',
  })
  id: string;

  @ApiProperty({
    example: 'Orbit Technology',
    description: 'Company name',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'info@orbitcrm.com',
    description: 'Company contact email address',
    nullable: true,
  })
  contactEmail: string | null;

  @ApiPropertyOptional({
    example: '+201001234567',
    description: 'Company phone number',
    nullable: true,
  })
  phone: string | null;

  @ApiPropertyOptional({
    example: '123 Nile Street, Cairo, Egypt',
    description: 'Company address',
    nullable: true,
  })
  address: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.orbitcrm.com/logos/orbit.png',
    description: 'Company logo URL',
    nullable: true,
  })
  logo: string | null;

  @ApiPropertyOptional({
    example: 'https://orbitcrm.com',
    description: 'Company website',
    nullable: true,
  })
  website: string | null;

  @ApiPropertyOptional({
    example: 'TX-123456789',
    description: 'Company tax number',
    nullable: true,
  })
  taxNumber: string | null;

  @ApiPropertyOptional({
    example: 'Orbit CRM provides ERP and CRM solutions.',
    description: 'Company description',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    example: true,
    description: 'Company active status',
  })
  isActive: boolean;

  @ApiProperty({
    example: '2026-07-29T18:30:00.000Z',
    description: 'Creation date',
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-07-29T18:35:00.000Z',
    description: 'Last update date',
    format: 'date-time',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    example: null,
    description: 'Soft delete date',
    nullable: true,
  })
  deletedAt: Date | null;

  constructor(data: ICompany) {
    Object.assign(this, data);
  }
}