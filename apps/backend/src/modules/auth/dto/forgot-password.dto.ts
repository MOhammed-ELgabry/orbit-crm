import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'mohammedelgabry187@gmail.com',
    description: 'The email address associated with the account.',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
