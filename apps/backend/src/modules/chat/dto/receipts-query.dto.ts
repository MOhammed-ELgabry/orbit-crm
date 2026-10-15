import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

export class ReceiptsQueryDto {
  @ApiProperty({ type: Number, description: 'Lowest own-message sequence.' })
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  from!: number;

  @ApiProperty({ type: Number, description: 'Highest own-message sequence.' })
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  to!: number;
}
