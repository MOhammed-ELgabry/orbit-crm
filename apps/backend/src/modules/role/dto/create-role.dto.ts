import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'Sales Rep',
    description: 'Role name. Must be unique within the company.',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({
    example: 'Can manage contacts and log activity, but not delete them.',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: ['cm123permission1', 'cm123permission2'],
    description:
      'IDs from GET /permissions to grant this role. Every id must exist ' +
      'in the global permission catalog — there is nothing tenant-owned ' +
      'to cross-check here, unlike assignedToId/contactId elsewhere.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionIds?: string[];
}
