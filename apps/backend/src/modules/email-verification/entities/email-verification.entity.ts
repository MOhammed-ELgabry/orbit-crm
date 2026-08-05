import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IEmailVerification } from '../interfaces/email-verification.interface';

export class EmailVerificationEntity implements IEmailVerification {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    example: '482913',
  })
  code: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiPropertyOptional({
    nullable: true,
  })
  verifiedAt: Date | null;

  @ApiProperty()
  attempts: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(data: IEmailVerification) {
    Object.assign(this, data);
  }
}
