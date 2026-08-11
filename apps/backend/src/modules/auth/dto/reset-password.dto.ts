import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MaxLength,
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
    example: 'NewPassword@123',
    description: 'The new password for the account.',
  })
  @IsStrongPassword()
  @MaxLength(100)
  newPassword: string;
}
