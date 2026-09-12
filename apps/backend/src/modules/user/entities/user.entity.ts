import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IUser, IUserRole } from '../interfaces/user.interface';

/**
 * Mirrors RoleEntity's existing RolePermissionSummary pattern: a
 * minimal, display-only projection nested on a parent entity, not a
 * parallel role representation. See IUserRole for what populates this.
 */
export class UserRoleSummary implements IUserRole {
  @ApiProperty({ example: 'cmf8m3v8j0000l704q9i8v4bx' })
  id: string;

  @ApiProperty({ example: 'MANAGER' })
  name: string;
}

export class UserEntity implements IUser {
  @ApiProperty({
    example: 'cmf8m3v8j0000l704q9i8v4bx',
    description: 'Unique user identifier',
  })
  id: string;

  @ApiProperty({
    example: 'Mohammed',
    description: 'User first name',
  })
  firstName: string;

  @ApiProperty({
    example: 'Elgabry',
    description: 'User last name',
  })
  lastName: string;

  @ApiProperty({
    example: 'owner@orbitcrm.com',
    description: 'User login email',
  })
  email: string;

  @ApiPropertyOptional({
    example: '+201001234567',
    description: 'User phone number',
    nullable: true,
  })
  phone: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.orbitcrm.com/avatar.png',
    description: 'User avatar URL',
    nullable: true,
  })
  avatar: string | null;

  @ApiProperty({
    example: true,
    description: 'User active status',
  })
  isActive: boolean;

  @ApiProperty({
    example: false,
    description: 'Company owner flag',
  })
  isOwner: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the user email has been verified',
  })
  isEmailVerified: boolean;

  @ApiPropertyOptional({
    example: null,
    description:
      'Assigned role id, or null if this user has no role assigned ' +
      '(see PermissionsGuard for what that means for their access).',
    nullable: true,
  })
  roleId: string | null;

  @ApiPropertyOptional({
    description:
      'Assigned role’s id and name, for display (e.g. the Team ' +
      'Members page). null when roleId is null (see the ' +
      '"Not Assigned" — no role — case); absent on endpoints that ' +
      "don't load this relation — see IUser.role.",
    type: UserRoleSummary,
    nullable: true,
  })
  role?: IUserRole | null;

  @ApiPropertyOptional({
    example: null,
    description: 'Last login date',
    nullable: true,
  })
  lastLoginAt: Date | null;

  @ApiPropertyOptional({
    example: null,
    description: 'Company identifier. Assigned after email verification.',
    nullable: true,
  })
  companyId: string | null;

  @ApiProperty({
    example: '2026-08-01T20:00:00.000Z',
    description: 'Creation date',
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-08-01T20:00:00.000Z',
    description: 'Last update date',
    format: 'date-time',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    example: null,
    description: 'Soft delete date',
    nullable: true,
  })
  deletedAt: Date | null;

  constructor(data: IUser) {
    this.id = data.id;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.phone = data.phone;
    this.avatar = data.avatar;
    this.isActive = data.isActive;
    this.isOwner = data.isOwner;
    this.isEmailVerified = data.isEmailVerified;
    this.roleId = data.roleId;
    this.role = data.role;
    this.lastLoginAt = data.lastLoginAt;
    this.companyId = data.companyId;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.deletedAt = data.deletedAt;
  }
}