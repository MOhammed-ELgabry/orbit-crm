import { IsOptional } from 'class-validator';

/**
 * The raw hints are validated field by field by the service (invalid parts
 * are dropped, never rejected), so the DTO only has to let the object
 * through the whitelist.
 */
export class RegionalHandoffDto {
  @IsOptional()
  hints?: unknown;
}
