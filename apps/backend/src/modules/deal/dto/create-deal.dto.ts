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

import { IsMoneyAmount } from '../../regional/money/is-money-amount.decorator';
import { normalizeMoneyInput } from '../../regional/money/money.util';
import { DEAL_STAGES } from '../constants/deal.constants';

export class CreateDealDto {
  @ApiProperty({
    example: 'Acme Corp — annual license renewal',
    description: 'Deal title',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Length(2, 200)
  title: string;

  @ApiPropertyOptional({
    example: '15000.50',
    description:
      'Deal value as a decimal string (up to 15 integer and 4 decimal digits; the allowed decimals follow the company base currency). A plain JSON number is still accepted. Defaults to 0 when omitted.',
  })
  // Money is a decimal STRING end to end (never a float). A JSON number from
  // an older client is converted to its plain decimal string by the Transform;
  // anything invalid is left untouched so IsMoneyAmount rejects it.
  @Transform(
    ({ value }: { value: unknown }) => normalizeMoneyInput(value) ?? value,
  )
  @IsOptional()
  @IsMoneyAmount()
  amount?: string;

  @ApiPropertyOptional({
    example: 'new',
    description: 'Pipeline stage. Defaults to "new" when omitted.',
    enum: DEAL_STAGES,
  })
  @IsOptional()
  @IsIn(DEAL_STAGES)
  stage?: string;

  @ApiPropertyOptional({
    example: 'Champion is the IT director; budget confirmed for Q3.',
    description: 'Internal notes about the deal',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Expected close date (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    description:
      'ID of the contact this deal is associated with. Must belong to ' +
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
      'ID of the lead this deal originated from, if any. Must belong ' +
      'to the same company as the authenticated user.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  leadId?: string;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    description:
      'ID of the user this deal is assigned to. Must belong to the ' +
      'same company as the authenticated user.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string;
}
