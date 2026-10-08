import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';

import { NOTIFICATION_PREFERENCE_CHANNELS } from '../constants/notification.constants';

/**
 * "internal" is intentionally not a valid channel: the in-app inbox is
 * always on and cannot be opted out of.
 */
export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: NOTIFICATION_PREFERENCE_CHANNELS, example: 'email' })
  @IsIn(NOTIFICATION_PREFERENCE_CHANNELS)
  channel!: (typeof NOTIFICATION_PREFERENCE_CHANNELS)[number];

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}
