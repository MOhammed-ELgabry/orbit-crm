import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/**
 * Body for PATCH /users/:id/appearance.
 *
 * Self-service endpoint (enforced by UserService.updateAppearance — the
 * :id path parameter must match the authenticated caller's own id, the
 * same check UserService.update already uses for the plain profile
 * endpoint). Single-purpose DTO, mirroring UpdateUserStatusDto —
 * accepts ONLY backgroundColor, nothing else.
 *
 * There is deliberately no foregroundColor field: the readable text
 * color is always computed from backgroundColor via a deterministic
 * WCAG contrast calculation (see the frontend's contrast utility), so
 * it is never user-chosen and never persisted.
 */
export class UpdateUserAppearanceDto {
  @ApiProperty({
    example: '#F6F8FC',
    description:
      'Background color for the main content canvas, as a 6-digit hex ' +
      'color (e.g. "#F6F8FC"). The foreground/text color is calculated ' +
      'automatically and is not part of this request.',
  })
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'backgroundColor must be a 6-digit hex color, e.g. "#F6F8FC".',
  })
  backgroundColor: string;
}