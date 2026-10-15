import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class OpenDirectConversationDto {
  @ApiProperty({
    example: 'cm123teammateid',
    description:
      'The teammate to talk to. Only a user id is accepted — the company, ' +
      'the participant list and the conversation key are derived on the server.',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  userId!: string;
}
