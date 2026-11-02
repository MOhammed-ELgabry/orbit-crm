import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

import { ConversationIdParamDto } from '../dto/conversation-id-param.dto';

export class AttachmentIdParamDto extends ConversationIdParamDto {
  @ApiProperty({ example: '0f8fad5b-d9cb-469f-a165-70867728950e' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  attachmentId!: string;
}
