import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import type { AuditActor } from '../audit/audit.types';

import { LEAD_CONVERSION_REPOSITORY } from './constants/lead-conversion.constants';
import type { ConvertLeadDto } from './dto/convert-lead.dto';
import type {
  LeadConversionPreview,
  LeadConversionResult,
} from './lead-conversion.types';
import type { ILeadConversionRepository } from './repository/lead-conversion.repository.interface';

/**
 * Thin on purpose: authentication, CSRF and the three permissions are
 * enforced by the controller's guards, and every business rule that has to
 * be atomic (eligibility, duplicate resolution, the writes) lives inside the
 * repository's single transaction so it is evaluated against the rows it
 * locks — not against a copy read earlier.
 */
@Injectable()
export class LeadConversionService {
  constructor(
    @Inject(LEAD_CONVERSION_REPOSITORY)
    private readonly leadConversionRepository: ILeadConversionRepository,
  ) {}

  preview(companyId: string, dealId: string): Promise<LeadConversionPreview> {
    return this.leadConversionRepository.preview(companyId, dealId);
  }

  convert(
    companyId: string,
    dealId: string,
    actorId: string,
    dto: ConvertLeadDto,
    audit: AuditActor,
  ): Promise<LeadConversionResult> {
    if (dto.resolution === 'link' && !dto.contactId) {
      throw new BadRequestException(
        'contactId is required when resolution is "link".',
      );
    }

    return this.leadConversionRepository.convert(
      companyId,
      dealId,
      actorId,
      {
        resolution: dto.resolution,
        contactId: dto.contactId,
        acknowledgeDuplicate: dto.acknowledgeDuplicate === true,
      },
      audit,
    );
  }
}
