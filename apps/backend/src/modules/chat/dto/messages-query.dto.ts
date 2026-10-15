import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from '../chat.constants';

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

export class MessagesQueryDto {
  @ApiPropertyOptional({
    type: Number,
    description:
      'Cursor: return messages with a sequence LOWER than this (older page).',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Cursor: return messages with a sequence HIGHER than this (recovery ' +
      'after a reconnect). Cannot be combined with `before`.',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  after?: number;

  @ApiPropertyOptional({
    type: Number,
    example: HISTORY_DEFAULT_LIMIT,
    description: `Page size (max ${HISTORY_MAX_LIMIT})`,
  })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_LIMIT)
  limit: number = HISTORY_DEFAULT_LIMIT;
}
