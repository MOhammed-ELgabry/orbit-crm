import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

/**
 * Profile-only update DTO.
 *
 * Deliberately NOT `PartialType(CreateUserDto)` and deliberately does
 * NOT include: companyId, isOwner, roleId, deletedAt, refreshTokenHash,
 * passwordHash, isActive. Tenant identity, ownership, role, and status
 * are never client-editable through this endpoint.
 *
 * isActive is changed exclusively via the dedicated, owner-only
 * PATCH /users/:id/status endpoint (see UpdateUserStatusDto).
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Mohammed',
    description: 'User first name',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 50)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Elgabry',
    description: 'User last name',
  })
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @Length(2, 50)
  lastName?: string;

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

  @ApiPropertyOptional({
    example: 'NewStrongPassword123!',
    description: 'New password',
  })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  password?: string;
}
