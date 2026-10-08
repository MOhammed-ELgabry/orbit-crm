import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class NotificationIdParamDto {
  @ApiProperty({ example: 'cm123notificationid' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  id!: string;
}
