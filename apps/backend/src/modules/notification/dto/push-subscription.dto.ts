import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  MAX_PUSH_ENDPOINT_LENGTH,
  MAX_USER_AGENT_LENGTH,
} from '../constants/notification.constants';

export class PushSubscriptionKeysDto {
  @ApiProperty({ description: 'Base64url P-256 public key (65 bytes)' })
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @ApiProperty({ description: 'Base64url auth secret (16 bytes)' })
  @IsString()
  @MaxLength(100)
  auth!: string;
}

/**
 * Shape of PushSubscription.toJSON() minus `expirationTime`, plus an
 * optional user-agent label. Deep validation (HTTPS, host, key sizes)
 * lives in push-endpoint.validator.ts so storage and send time share it.
 */
export class SubscribePushDto {
  @ApiProperty({ example: 'https://push.example.com/send/abc' })
  @IsString()
  @MaxLength(MAX_PUSH_ENDPOINT_LENGTH)
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional({ description: 'Optional device label (browser UA)' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_USER_AGENT_LENGTH)
  userAgent?: string;
}

export class UnsubscribePushDto {
  @ApiProperty({ example: 'https://push.example.com/send/abc' })
  @IsString()
  @MaxLength(MAX_PUSH_ENDPOINT_LENGTH)
  endpoint!: string;
}
