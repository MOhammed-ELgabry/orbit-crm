import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  INBOX_DEFAULT_PAGE_SIZE,
  INBOX_MAX_PAGE_SIZE,
} from '../constants/notification.constants';

export class NotificationQueryDto {
  @ApiPropertyOptional({ type: Number, example: 1, description: 'Page number' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: Number,
    example: INBOX_DEFAULT_PAGE_SIZE,
    description: `Items per page (max ${INBOX_MAX_PAGE_SIZE})`,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(INBOX_MAX_PAGE_SIZE)
  limit = INBOX_DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description: 'Only return unread notifications',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  unreadOnly?: boolean;
}
