import {
  buildProposedContact,
  duplicateFlags,
  ineligibleReason,
  leadDisplayName,
  mergeCandidates,
  type CandidateRow,
} from './lead-conversion.policy';

const row = (id: string, over: Partial<CandidateRow> = {}): CandidateRow => ({
  id,
  firstName: 'Sara',
  lastName: 'Ali',
  email: null,
  phone: null,
  mobile: null,
  organizationName: null,
  status: 'active',
  ...over,
});

describe('lead-conversion.policy', () => {
  describe('ineligibleReason', () => {
    it.each(['new', 'qualified', 'negotiation', 'closed_lost'])(
      'refuses a deal in stage %s',
      (stage) => {
        expect(ineligibleReason({ stage, leadId: 'l1' }, true)).toBe(
          'deal_not_won',
        );
      },
    );

    it('refuses a won deal without a lead', () => {
      expect(
        ineligibleReason({ stage: 'closed_won', leadId: null }, false),
      ).toBe('deal_has_no_lead');
    });

    it('refuses a won deal whose lead is gone', () => {
      expect(
        ineligibleReason({ stage: 'closed_won', leadId: 'l1' }, false),
      ).toBe('lead_not_found');
    });

    it('accepts a won deal with its lead', () => {
      expect(
        ineligibleReason({ stage: 'closed_won', leadId: 'l1' }, true),
      ).toBeNull();
    });
  });

  describe('buildProposedContact', () => {
    const lead = {
      firstName: 'Sara',
      lastName: 'Ali',
      email: 'sara@x.com',
      phone: '0100',
      organizationName: 'Acme',
      source: 'web',
      notes: 'wants a demo',
    };

    it('copies the lead data, makes the contact a customer and never copies the lead status', () => {
      expect(
        buildProposedContact({ ...lead, status: 'qualified' } as never, 'u1'),
      ).toEqual({
        ...lead,
        status: 'customer',
        assignedToId: 'u1',
      });
    });

    it('keeps null fields null', () => {
      const proposed = buildProposedContact(
        { ...lead, email: null, phone: null, notes: null },
        null,
      );
      expect(proposed.email).toBeNull();
      expect(proposed.phone).toBeNull();
      expect(proposed.notes).toBeNull();
      expect(proposed.assignedToId).toBeNull();
    });
  });

  describe('mergeCandidates', () => {
    it('lists one entry per contact with every reason it matched', () => {
      const a = row('a');
      const merged = mergeCandidates({
        dealContact: a,
        emailMatches: [a, row('b')],
        phoneMatches: [a, row('c')],
      });

      expect(merged.map((c) => [c.contactId, c.matchedOn])).toEqual([
        ['a', ['deal', 'email', 'phone']],
        ['b', ['email']],
        ['c', ['phone']],
      ]);
    });

    it('returns an empty list when nothing matched', () => {
      expect(
        mergeCandidates({
          dealContact: null,
          emailMatches: [],
          phoneMatches: [],
        }),
      ).toEqual([]);
    });
  });

  describe('duplicateFlags', () => {
    const flagsFor = (...matchedOn: Array<Array<'deal' | 'email' | 'phone'>>) =>
      duplicateFlags(
        matchedOn.map((m, i) => ({
          ...row(`c${i}`),
          contactId: `c${i}`,
          matchedOn: m,
        })),
      );

    it('has no flags without candidates', () => {
      expect(flagsFor()).toEqual({
        blocksCreate: false,
        requiresAcknowledgement: false,
      });
    });

    it('blocks create on an email match', () => {
      expect(flagsFor(['email'])).toEqual({
        blocksCreate: true,
        requiresAcknowledgement: false,
      });
    });

    it('blocks create when the deal already has a contact', () => {
      expect(flagsFor(['deal'])).toEqual({
        blocksCreate: true,
        requiresAcknowledgement: false,
      });
    });

    it('only asks for acknowledgement on a phone-only match', () => {
      expect(flagsFor(['phone'])).toEqual({
        blocksCreate: false,
        requiresAcknowledgement: true,
      });
    });

    it('a phone match next to an email match is still a hard block', () => {
      expect(flagsFor(['phone'], ['email'])).toEqual({
        blocksCreate: true,
        requiresAcknowledgement: false,
      });
    });
  });

  it('leadDisplayName trims', () => {
    expect(leadDisplayName({ firstName: 'Sara', lastName: '' })).toBe('Sara');
    expect(leadDisplayName({ firstName: 'Sara', lastName: 'Ali' })).toBe(
      'Sara Ali',
    );
  });
});
