import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RolePermissionSummary {
  @ApiProperty({ example: 'cmf8m3v8j0000l704q9i8v4bx' })
  id: string;

  @ApiProperty({ example: 'contact' })
  resource: string;

  @ApiProperty({ example: 'create' })
  action: string;
}

export class RoleEntity {
  @ApiProperty({ example: 'cmf8m3v8j0000l704q9i8v4bx' })
  id: string;

  @ApiProperty({ example: 'Sales Rep' })
  name: string;

  @ApiPropertyOptional({
    example: 'Can manage contacts and log activity.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    example: 'cmf8m3v8j0000l704q9i8v4bx',
    description: 'Owning tenant.',
  })
  companyId: string;

  @ApiProperty({ type: [RolePermissionSummary] })
  permissions: RolePermissionSummary[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  constructor(partial: Partial<RoleEntity>) {
    Object.assign(this, partial);
  }
}
