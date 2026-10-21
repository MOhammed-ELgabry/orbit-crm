import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject } from 'class-validator';

/**
 * أقصى عدد صفوف في الطلب الواحد. الواجهة بتقسّم الملف (حتى 1,000 صف) على
 * دفعات بالحجم ده أو أقل، فمفيش حاجة تستدعي رفع حد الـ body الافتراضي.
 */
export const CONTACT_IMPORT_MAX_ROWS_PER_REQUEST = 100;

/**
 * Body of POST /contacts/import/validate and POST /contacts/import.
 *
 * The rows are deliberately NOT declared as a nested CreateContactDto array:
 * the global ValidationPipe (whitelist + forbidNonWhitelisted) would then
 * reject the WHOLE request as soon as a single row is invalid, and the user
 * would never see which rows are fine. Each row is validated one by one in
 * ContactImportService against the real CreateContactDto instead, so the
 * validation/normalization rules stay in exactly one place.
 */
export class ImportContactsDto {
  @ApiProperty({
    description:
      'Rows to validate/import. Each row is a flat object using CreateContactDto field names (assignedToId is not accepted).',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    minItems: 1,
    maxItems: CONTACT_IMPORT_MAX_ROWS_PER_REQUEST,
    example: [
      { firstName: 'John', lastName: 'Smith', email: 'john.smith@example.com' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTACT_IMPORT_MAX_ROWS_PER_REQUEST)
  @IsObject({ each: true })
  rows: Record<string, unknown>[];
}
