import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateDealDto {
  @ApiPropertyOptional({
    example: 'Acme Corp — annual license renewal',
    description: 'Deal title',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @ApiPropertyOptional({
    example: 18000,
    description: 'Deal value',
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
    example: 'negotiation',
    description:
      'Pipeline stage. Also used for marking a deal won/lost — there is ' +
      'no separate close endpoint, matching how Lead uses its own ' +
      'update endpoint for status changes.',
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
    nullable: true,
    description: 'Expected close date (ISO 8601). Pass null to clear it.',
  })
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string | null;

  @ApiPropertyOptional({
    example: 'cm123contactid',
    nullable: true,
    description:
      'ID of the contact this deal is associated with. Must belong to ' +
      'the same company as the authenticated user. Pass null to clear it.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contactId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123leadid',
    nullable: true,
    description:
      'ID of the lead this deal originated from. Must belong to the ' +
      'same company as the authenticated user. Pass null to clear it.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  leadId?: string | null;

  @ApiPropertyOptional({
    example: 'cm123assigneduser',
    nullable: true,
    description:
      'ID of the user this deal is assigned to. Must belong to the ' +
      'same company as the authenticated user. Pass null to unassign.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string | null;
}
