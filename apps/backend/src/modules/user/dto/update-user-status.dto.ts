import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Body for PATCH /users/:id/status.
 *
 * Owner-only endpoint (enforced by OwnerGuard at the controller level).
 * Accepts ONLY isActive — no other field is present or accepted.
 */
export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description: 'Whether the user account is active.',
  })
  @IsBoolean()
  isActive: boolean;
}
