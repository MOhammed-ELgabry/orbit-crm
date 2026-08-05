import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'Mohammed',
    description: 'User first name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  firstName: string;

  @ApiProperty({
    example: 'Elgabry',
    description: 'User last name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  lastName: string;

  @ApiProperty({
    example: 'owner@orbitcrm.com',
    description: 'User login email',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    description: 'User password',
  })
  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  password: string;

  @ApiPropertyOptional({
    example: '+201001234567',
    description: 'User phone number',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.orbitcrm.com/avatar.png',
    description: 'User avatar URL',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @ApiProperty({
    example: 'cms6clch80000v0a8fhmevd9h',
    description: 'Company identifier',
  })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Company owner flag',
  })
  @IsOptional()
  @IsBoolean()
  isOwner?: boolean;
}
