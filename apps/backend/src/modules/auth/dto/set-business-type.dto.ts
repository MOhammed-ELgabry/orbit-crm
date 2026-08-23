import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

import { BUSINESS_TYPES } from '../../company/constants/business-type.constants';
import type { BusinessType } from '../../company/constants/business-type.constants';

export class SetBusinessTypeDto {
  @ApiProperty({
    example: 'a1b2c3...',
    description:
      'The one-time onboarding token returned by verify-email (or, for a ' +
      'new social sign-up, the social callback) — proves the caller just ' +
      'completed onboarding for this company without requiring a session.',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'real_estate',
    enum: BUSINESS_TYPES,
    description: 'The selected business type.',
  })
  @IsIn(BUSINESS_TYPES)
  businessType: BusinessType;
}