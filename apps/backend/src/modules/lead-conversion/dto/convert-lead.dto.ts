import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

import { LEAD_CONVERSION_RESOLUTIONS } from '../constants/lead-conversion.constants';

/**
 * What the user decided in the confirmation dialog. It carries NO lead data,
 * NO company and NO field values: the Lead, the Deal and the proposed
 * Contact are always re-read from the database inside the conversion
 * transaction, so nothing the client sends can change what is created.
 * (The global ValidationPipe has forbidNonWhitelisted, so any other
 * property — a companyId, a leadId, contact fields — is a 400.)
 */
export class ConvertLeadDto {
  @ApiProperty({
    enum: LEAD_CONVERSION_RESOLUTIONS,
    example: 'create',
    description:
      '"create" makes a new Contact from the Lead; "link" attaches the Lead and the Deal to an existing Contact of the same company (that Contact is never modified).',
  })
  @IsIn(LEAD_CONVERSION_RESOLUTIONS)
  resolution: 'create' | 'link';

  @ApiPropertyOptional({
    example: 'cm123existingcontact',
    description: 'Required when resolution is "link".',
  })
  @ValidateIf((dto: ConvertLeadDto) => dto.resolution === 'link')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  contactId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Only meaningful for "create": set to true to create a new Contact although another Contact has the same phone number (an email match can never be overridden).',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicate?: boolean;
}
