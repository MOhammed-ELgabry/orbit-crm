import { ApiProperty } from '@nestjs/swagger';
import { IsString, ValidateIf } from 'class-validator';

/**
 * Single-purpose DTO, mirroring UpdateUserStatusDto — accepts ONLY
 * roleId, nothing else. Pass a role id to assign it, or null to
 * unassign, returning the user to the default (no role) access level
 * described in PermissionsGuard.
 */
export class UpdateUserRoleDto {
  @ApiProperty({
    example: 'cm123roleid',
    nullable: true,
    description:
      'Role id (from this company) to assign to the user, or null to ' +
      'unassign. Required — omitting the field entirely is a validation ' +
      'error, matching this DTO’s single-purpose contract.',
  })
  @ValidateIf((dto: UpdateUserRoleDto) => dto.roleId !== null)
  @IsString()
  roleId: string | null;
}
