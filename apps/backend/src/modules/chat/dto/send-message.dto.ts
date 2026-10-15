import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

  @ApiProperty({ example: 'Hello team', maxLength: MESSAGE_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeMessageBody(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  body!: string;
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
