/**
 * Lead -> Contact conversion after a won Deal. Mirrors the backend's
 * lead-conversion module (GET/POST /deals/:id/lead-conversion).
 */
export type ConversionMatchedOn = "deal" | "email" | "phone";

export interface ConversionCandidate {
  contactId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  organizationName: string | null;
  status: string;
  matchedOn: ConversionMatchedOn[];
}

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

export type ConversionIneligibleReason =
  "deal_not_won" | "deal_has_no_lead" | "lead_not_found";

export interface LeadConversionPreview {
  eligible: boolean;
  reason: ConversionIneligibleReason | null;
  alreadyConverted: {
    contactId: string | null;
    convertedAt: string;
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

export type ConvertLeadInput =
  | { resolution: "create"; acknowledgeDuplicate?: boolean }
  | { resolution: "link"; contactId: string };

export type ConversionOutcome = "created" | "linked" | "already_converted";

export interface ConvertLeadResult {
  outcome: ConversionOutcome;
  contactId: string;
  leadId: string;
  dealId: string;
  relinked: { deals: number; tasks: number; calendarEvents: number };
}
