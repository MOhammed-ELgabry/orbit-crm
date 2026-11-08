import type { AuditActor } from '../../audit/audit.types';
import type {
  ConvertLeadInput,
  LeadConversionPreview,
  LeadConversionResult,
} from '../lead-conversion.types';

export interface ILeadConversionRepository {
  /** Read-only: eligibility, the proposed Contact and duplicate candidates. */
  preview(companyId: string, dealId: string): Promise<LeadConversionPreview>;

  /**
   * The whole conversion in ONE transaction (all-or-nothing). Idempotent: a
   * Lead that is already converted returns `already_converted` and writes
   * nothing but, at most, the missing Deal -> Contact link.
   */
  convert(
    companyId: string,
    dealId: string,
    actorId: string,
    input: ConvertLeadInput,
    audit: AuditActor,
  ): Promise<LeadConversionResult>;
}
