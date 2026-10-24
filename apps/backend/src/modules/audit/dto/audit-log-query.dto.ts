import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { AUDIT_QUERY_LIMITS } from '../audit.constants';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditEntityType,
} from '../audit.types';

/**
 * Query of GET /audit-logs. There is intentionally NO companyId (or any
 * identity) field: the ValidationPipe is configured with
 * forbidNonWhitelisted, so a client-supplied companyId is rejected with 400.
 */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: AUDIT_QUERY_LIMITS.defaultLimit })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(AUDIT_QUERY_LIMITS.maxLimit)
  limit: number = AUDIT_QUERY_LIMITS.defaultLimit;

  @ApiPropertyOptional({
    description: `Start of the period (ISO-8601, UTC). Default: ${AUDIT_QUERY_LIMITS.defaultRangeDays} days before "to".`,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    description: `End of the period (ISO-8601, UTC). Default: now. The period cannot exceed ${AUDIT_QUERY_LIMITS.maxRangeDays} days.`,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  actorUserId?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AUDIT_ENTITY_TYPES })
  @IsOptional()
  @IsIn(AUDIT_ENTITY_TYPES)
  entityType?: AuditEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  correlationId?: string;

  @ApiPropertyOptional({
    description: 'Search in the record label and in the actor name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AuditLogIdParamDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  id!: string;
}
