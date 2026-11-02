import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  CLIENT_MESSAGE_ID_PATTERN,
  MESSAGE_MAX_LENGTH,
} from '../chat.constants';

export class SendMessageDto {
  @ApiProperty({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description:
      'Client-generated id making the request retry-safe: re-sending the ' +
      'same id returns the already persisted message.',
  })
  @IsString()
  @Matches(CLIENT_MESSAGE_ID_PATTERN)
  clientMessageId!: string;

  @ApiProperty({
    example: 'Hello team',
    maxLength: MESSAGE_MAX_LENGTH,
    description:
      'Required, except for a message that carries an attachment (then it ' +
      'may be empty or omitted).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeMessageBody(value) : value,
  )
  // Without an attachment the body rules are exactly the original ones. With
  // one, an empty/missing body is allowed (attachment-only message); a
  // non-empty body is still fully validated.
  @ValidateIf(
    (dto: SendMessageDto) =>
      dto.attachmentId === undefined ||
      (dto.body !== undefined && dto.body !== ''),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  body!: string;

  @ApiPropertyOptional({
    description:
      'Id of a READY attachment uploaded by the caller to this conversation ' +
      '(one per message). Linked atomically with the message.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  attachmentId?: string;
}

/**
 * Plain-text only: NULs and other control characters (except tab/newline)
 * are removed, CRLF is normalised and surrounding whitespace is trimmed.
 * Rendering is always as text on the client; nothing here is HTML.
 */
export function normalizeMessageBody(value: string): string {
  return (
    value
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
  );
}
