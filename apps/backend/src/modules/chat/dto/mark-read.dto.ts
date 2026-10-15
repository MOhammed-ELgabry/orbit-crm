import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class MarkReadDto {
  @ApiProperty({
    example: 42,
    description:
      'Highest message sequence that was VISIBLE to the user on screen. The ' +
      'server clamps it to the conversation and ignores backwards moves; it ' +
      'is a visibility acknowledgement, not proof the text was understood.',
  })
  @IsInt()
  @Min(1)
  upToSequence!: number;
}
