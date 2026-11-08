import type { LEAD_CONVERSION_RESOLUTIONS } from './constants/lead-conversion.constants';

export type ConversionResolution = (typeof LEAD_CONVERSION_RESOLUTIONS)[number];

/**
 * Why a Contact is offered as a duplicate candidate.
 *  - deal:  it is already the Deal's own Contact (never overwritten).
 *  - email: same email, case-insensitive (strong match — blocks "create").
 *  - phone: same phone/mobile, exact after trim (weak match — needs an
 *           explicit acknowledgement to create anyway).
 */
export type MatchedOn = 'deal' | 'email' | 'phone';

export interface ConversionCandidate {
  contactId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  organizationName: string | null;
  status: string;
  matchedOn: MatchedOn[];
}

/** The Contact a "create" would produce (see lead-conversion.policy.ts). */
export interface ProposedContact {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  assignedToId: string | null;
}

export type IneligibleReason =
  'deal_not_won' | 'deal_has_no_lead' | 'lead_not_found';

export interface LeadConversionPreview {
  eligible: boolean;
  reason: IneligibleReason | null;
  /** Set when the Lead was already converted (a retry is a safe no-op). */
  alreadyConverted: {
    contactId: string | null;
    convertedAt: Date;
  } | null;
  deal: {
    id: string;
    title: string;
    stage: string;
    contactId: string | null;
    leadId: string | null;
  };
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    organizationName: string | null;
    source: string | null;
    status: string;
    notes: string | null;
  } | null;
  proposedContact: ProposedContact | null;
  candidates: ConversionCandidate[];
  duplicate: {
    /** true: "create" is refused; the only way forward is to link. */
    blocksCreate: boolean;
    /** true: "create" needs acknowledgeDuplicate = true. */
    requiresAcknowledgement: boolean;
  };
}

export interface ConvertLeadInput {
  resolution: ConversionResolution;
  contactId?: string;
  acknowledgeDuplicate?: boolean;
}

export type ConversionOutcome = 'created' | 'linked' | 'already_converted';

export interface LeadConversionResult {
  outcome: ConversionOutcome;
  contactId: string;
  leadId: string;
  dealId: string;
  /** How many OTHER records were pointed at the Contact (contactId was null). */
  relinked: {
    deals: number;
    tasks: number;
    calendarEvents: number;
  };
}
