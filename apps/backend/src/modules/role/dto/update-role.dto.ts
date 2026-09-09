import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Senior Sales Rep' })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'Can manage and delete contacts.' })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: ['cm123permission1', 'cm123permission2'],
    description:
      'When provided, REPLACES the role’s full permission set with ' +
      'exactly this list (not a merge). Omit this field entirely to leave ' +
      'permissions unchanged.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionIds?: string[];
}
