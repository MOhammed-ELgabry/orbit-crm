import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from './pagination-meta.dto';

export class PaginationResponseDto<T> {
  @ApiProperty({
    isArray: true,
    description: 'Returned items',
  })
  items: T[];

  @ApiProperty({
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;

  constructor(items: T[], meta: PaginationMetaDto) {
    this.items = items;
    this.meta = meta;
  }
}
