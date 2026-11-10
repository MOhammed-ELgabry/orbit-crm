import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * The Owner's decision. Every field is required: confirming regional
 * settings means choosing the country, the base currency, the company
 * timezone and the default locale together. Semantic validation (the
 * country/currency exist and are active, the zone is a real IANA zone, the
 * locale is a valid BCP-47 tag) lives in RegionalSettingsService.
 */
export class ConfirmRegionalSettingsDto {
  @ApiProperty({ example: 'EG', description: 'ISO 3166-1 alpha-2 country' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode: string;

  @ApiProperty({ example: 'EGP', description: 'ISO 4217 base currency' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  baseCurrencyCode: string;

  @ApiProperty({ example: 'Africa/Cairo', description: 'IANA timezone' })
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  timezone: string;

  @ApiProperty({ example: 'ar-EG', description: 'BCP-47 default locale' })
  @Transform(trim)
  @IsString()
  @Length(2, 35)
  defaultLocale: string;

  @ApiPropertyOptional({
    description:
      'Required when changing an existing base currency while the company already has deals: existing amounts are NOT converted.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeCurrencyChange?: boolean;
}
