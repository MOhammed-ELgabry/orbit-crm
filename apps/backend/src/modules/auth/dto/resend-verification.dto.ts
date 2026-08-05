import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({
    example: 'mohammedelgabry187@gmail.com',
    description: 'Email address that needs a new verification code.',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
