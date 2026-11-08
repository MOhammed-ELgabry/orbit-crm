import { CONVERTED_CONTACT_STATUS } from './constants/lead-conversion.constants';
import type {
  ConversionCandidate,
  IneligibleReason,
  MatchedOn,
  ProposedContact,
} from './lead-conversion.types';

/**
 * Pure decision functions of the Lead -> Contact conversion (no I/O), so the
 * rules that matter — eligibility, the field mapping and duplicate
 * classification — are unit-testable in isolation and shared verbatim by the
 * preview and by the transactional conversion.
 */

interface DealLike {
  stage: string;
  leadId: string | null;
}

interface LeadFieldsLike {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  source: string | null;
  notes: string | null;
}

/** The stage that means "won" — the project's DEAL_STAGES, not a guess. */
export const CONVERTIBLE_DEAL_STAGE = 'closed_won';

/**
 * Whether a conversion may start from this Deal. `null` = eligible.
 * (An already-converted Lead is NOT an ineligibility: repeating the request
 * is an idempotent no-op, reported separately.)
 */
export function ineligibleReason(
  deal: DealLike,
  leadFound: boolean,
): IneligibleReason | null {
  if (deal.stage !== CONVERTIBLE_DEAL_STAGE) {
    return 'deal_not_won';
  }

  if (!deal.leadId) {
    return 'deal_has_no_lead';
  }

  return leadFound ? null : 'lead_not_found';
}

/**
 * The Lead -> Contact field-mapping policy (PRD section 5).
 *
 * Copied as they are: names, email, phone, organizationName, source, notes
 * (the three DTOs agree on every length, so nothing can be truncated).
 * Not copied: the Lead's status (the new Contact is a `customer`), its
 * creator (the Contact's creator is whoever converted it), and its
 * timestamps. Contact-only fields (mobile, jobTitle, website, address…) have
 * no source on a Lead and stay null.
 */
export function buildProposedContact(
  lead: LeadFieldsLike,
  assignedToId: string | null,
): ProposedContact {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    organizationName: lead.organizationName,
    source: lead.source,
    notes: lead.notes,
    status: CONVERTED_CONTACT_STATUS,
    assignedToId,
  };
}

/** Raw Contact row shape the candidate search selects. */
export interface CandidateRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  organizationName: string | null;
  status: string;
}

/**
 * Merges the three match sources into one list with one entry per Contact
 * (a Contact can match on several keys). Order is stable: the Deal's own
 * Contact first, then email matches, then phone matches.
 */
export function mergeCandidates(sources: {
  dealContact: CandidateRow | null;
  emailMatches: readonly CandidateRow[];
  phoneMatches: readonly CandidateRow[];
}): ConversionCandidate[] {
  const byId = new Map<string, ConversionCandidate>();

  const add = (row: CandidateRow, key: MatchedOn): void => {
    const existing = byId.get(row.id);

    if (existing) {
      if (!existing.matchedOn.includes(key)) {
        existing.matchedOn.push(key);
      }
      return;
    }

    byId.set(row.id, {
      contactId: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      mobile: row.mobile,
      organizationName: row.organizationName,
      status: row.status,
      matchedOn: [key],
    });
  };

  if (sources.dealContact) {
    add(sources.dealContact, 'deal');
  }

  sources.emailMatches.forEach((row) => add(row, 'email'));
  sources.phoneMatches.forEach((row) => add(row, 'phone'));

  return [...byId.values()];
}

/**
 * What the candidates mean for a "create":
 *  - the Deal already has a Contact, or someone has the same email  ->
 *    create is refused (blocksCreate);
 *  - only the phone matches -> create is allowed but must be acknowledged,
 *    because Orbit does not prevent duplicate phones anywhere else.
 */
export function duplicateFlags(candidates: readonly ConversionCandidate[]): {
  blocksCreate: boolean;
  requiresAcknowledgement: boolean;
} {
  const blocksCreate = candidates.some(
    (candidate) =>
      candidate.matchedOn.includes('deal') ||
      candidate.matchedOn.includes('email'),
  );

  const requiresAcknowledgement =
    !blocksCreate &&
    candidates.some((candidate) => candidate.matchedOn.includes('phone'));

  return { blocksCreate, requiresAcknowledgement };
}

/** Human-readable name used in the conversion's activity text. */
export function leadDisplayName(lead: {
  firstName: string;
  lastName: string;
}): string {
  return `${lead.firstName} ${lead.lastName}`.trim();
}
