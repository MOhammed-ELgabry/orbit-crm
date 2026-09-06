import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionEntity {
  @ApiProperty({ example: 'cmf8m3v8j0000l704q9i8v4bx' })
  id: string;

  @ApiProperty({ example: 'contact', description: 'Resource this permission applies to.' })
  resource: string;

  @ApiProperty({ example: 'create', description: 'Action this permission grants on the resource.' })
  action: string;

  @ApiPropertyOptional({ example: 'Create new contacts.', nullable: true })
  description: string | null;

  constructor(partial: Partial<PermissionEntity>) {
    Object.assign(this, partial);
  }
}
