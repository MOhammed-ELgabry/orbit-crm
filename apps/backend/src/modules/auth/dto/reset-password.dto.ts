import { ApiProperty } from '@nestjs/swagger';

import {
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'ضع هنا Reset Token الذي وصلك في الإيميل',
    description: 'The password reset token received by email.',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'NewPassword123',
    description: 'The new password for the account.',
  })
  @IsString()
  @Length(8, 100)
  newPassword: string;
}