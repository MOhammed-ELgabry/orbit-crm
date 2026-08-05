import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    example: 'your-refresh-token-here',
    description: 'The refresh token to revoke.',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
