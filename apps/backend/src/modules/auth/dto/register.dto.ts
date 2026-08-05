import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'Mohammed',
  })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({
    example: 'Elgabry',
  })
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiProperty({
    example: 'owner@orbitcrm.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'StrongPassword123!',
  })
  @IsStrongPassword()
  password: string;

  @ApiPropertyOptional({
    example: '+201001234567',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.orbitcrm.com/avatar.png',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({
    example: 'cms6clch80000v0a8fhmevd9h',
  })
  @IsString()
  companyId: string;

  @ApiPropertyOptional({
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isOwner?: boolean;
}
