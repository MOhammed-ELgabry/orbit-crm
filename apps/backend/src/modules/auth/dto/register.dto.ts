import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'Mohammed',
  })
  @IsString()
  @Length(2, 50)
  firstName: string;

  @ApiProperty({
    example: 'Elgabry',
  })
  @IsString()
  @Length(2, 50)
  lastName: string;

  @ApiProperty({
    example: 'mohammed.elgabry.test@gmail.com',
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'Mohammed123',
    description: 'Password must be between 8 and 100 characters.',
  })
  @IsString()
  @Length(8, 100)
  password: string;

  @ApiProperty({
    example: 'Orbit CRM',
  })
  @IsString()
  @Length(2, 100)
  companyName: string;

  @ApiPropertyOptional({
    example: '+201001234567',
  })
  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.orbitcrm.com/avatar.png',
    deprecated: true,
    description:
      'Deprecated and ignored: external picture URLs are never stored. To ' +
      'set a profile picture at registration, send multipart/form-data with ' +
      'an image file in the "avatar" field (PNG, JPEG or WebP, up to 512 KB).',
  })
  @IsOptional()
  @IsUrl()
  avatar?: string;
}
