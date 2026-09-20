import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { LANGUAGES } from '../constants/language.constants';
import type { Language } from '../constants/language.constants';

/**
 * Body for PATCH /users/:id/language.
 *
 * Self-service endpoint (enforced by UserService.updateLanguage — the
 * :id path parameter must match the authenticated caller's own id, the
 * same check UserService.update already uses for the plain profile
 * endpoint). Single-purpose DTO, mirroring UpdateUserStatusDto —
 * accepts ONLY language, nothing else.
 */
export class UpdateUserLanguageDto {
  @ApiProperty({
    example: 'ar',
    enum: LANGUAGES,
    description: 'Interface language preference.',
  })
  @IsIn(LANGUAGES)
  language: Language;
}
