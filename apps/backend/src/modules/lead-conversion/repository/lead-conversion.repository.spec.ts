/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest asymmetric matchers (expect.objectContaining) are typed any */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { AuditActor } from '../../audit/audit.types';

import { LeadConversionRepository } from './lead-conversion.repository';

/**
 * Mocked-transaction tests of the conversion's DECISIONS and WRITE ORDER
 * (which rows are touched, what is refused, what is audited). They cannot
 * prove locking, the real unique index or rollback — that needs the test
 * database (test/integration/lead-conversion).
 */
const audit: AuditActor = { actorUserId: 'actor-1', correlationId: 'corr-1' };
const companyId = 'co-1';

const wonDeal = {
  id: 'd1',
  companyId,
  title: 'Big deal',
  stage: 'closed_won',
  leadId: 'l1' as string | null,
  contactId: null as string | null,
  assignedToId: null,
  amount: null,
  expectedCloseDate: null,
  deletedAt: null,
};

const lead = {
  id: 'l1',
  companyId,
  firstName: 'Sara',
  lastName: 'Ali',
  email: 'sara@x.com',
  phone: '0100',
  organizationName: 'Acme',
  source: 'web',
  status: 'qualified',
  notes: 'wants a demo' as string | null,
  assignedToId: 'u1',
  convertedAt: null as Date | null,
  convertedContactId: null as string | null,
  convertedByDealId: null as string | null,
  deletedAt: null,
};

const existingContact = (id: string, over: Record<string, unknown> = {}) => ({
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

interface Setup {
  deal?: typeof wonDeal | null;
  lead?: typeof lead | null;
  contacts?: Record<string, unknown>; // findFirst by id
  emailMatches?: unknown[];
  phoneMatches?: unknown[];
  claimCount?: number;
  otherDeals?: unknown[];
  tasks?: unknown[];
  events?: unknown[];
  activeUser?: boolean;
}

function makeRepo(setup: Setup = {}) {
  const calls: string[] = [];
  const track =
    <T>(name: string, value: T) =>
    (...args: unknown[]): Promise<T> => {
      calls.push(name);
      void args;
      return Promise.resolve(value);
    };

  const dealRow = setup.deal === undefined ? wonDeal : setup.deal;
  const leadRow = setup.lead === undefined ? lead : setup.lead;
  const leadAfter = { ...lead, status: 'converted', convertedAt: new Date() };

  const tx = {
    $executeRaw: jest.fn(track('lock', 1)),
    user: {
      findFirst: jest.fn(() =>
        Promise.resolve(setup.activeUser === false ? null : { id: 'u1' }),
      ),
    },
    deal: {
      findFirst: jest.fn(track('deal.findFirst', dealRow)),
      findFirstOrThrow: jest.fn(track('deal.findFirstOrThrow', dealRow)),
      findMany: jest.fn(track('deal.findMany', setup.otherDeals ?? [])),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          calls.push('deal.update');
          return Promise.resolve({ ...wonDeal, id: where.id, ...data });
        },
      ),
    },
    lead: {
      findFirst: jest.fn(track('lead.findFirst', leadRow)),
      updateMany: jest.fn(
        track('lead.updateMany', { count: setup.claimCount ?? 1 }),
      ),
      findFirstOrThrow: jest.fn(track('lead.findFirstOrThrow', leadAfter)),
    },
    contact: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => {
        calls.push('contact.findFirst');
        return Promise.resolve(setup.contacts?.[where.id] ?? null);
      }),
      findMany: jest.fn(({ where }: { where: { email?: unknown } }) => {
        calls.push('contact.findMany');
        return Promise.resolve(
          where.email ? (setup.emailMatches ?? []) : (setup.phoneMatches ?? []),
        );
      }),
      create: jest.fn(({ data }: { data: object }) => {
        calls.push('contact.create');
        return Promise.resolve({ id: 'new-contact', ...data });
      }),
    },
    task: {
      findMany: jest.fn(track('task.findMany', setup.tasks ?? [])),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          calls.push('task.update');
          return Promise.resolve({ id: where.id, ...data });
        },
      ),
    },
    calendarEvent: {
      findMany: jest.fn(track('event.findMany', setup.events ?? [])),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          calls.push('event.update');
          return Promise.resolve({ id: where.id, ...data });
        },
      ),
    },
    activity: {
      create: jest.fn(({ data }: { data: { type: string } }) => {
        calls.push(`activity.${data.type}`);
        return Promise.resolve({ id: 'act', ...data });
      }),
    },
    auditLog: { create: jest.fn(() => Promise.resolve({})) },
  };

  const prisma = {
    ...tx, // preview() reads through the plain client
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return {
    repo: new LeadConversionRepository(prisma as never),
    tx,
    prisma,
    calls,
  };
}

const auditedEntities = (tx: { auditLog: { create: jest.Mock } }) =>
  (
    tx.auditLog.create.mock.calls as unknown as Array<
      [{ data: { entityType: string } }]
    >
  ).map((c) => c[0].data.entityType);

describe('LeadConversionRepository.convert', () => {
  describe('refusals (nothing is written)', () => {
    it('404 when the deal is not in this company', async () => {
      const { repo, tx } = makeRepo({ deal: null });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.contact.create).not.toHaveBeenCalled();
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
    });

    it('400 when the deal is not closed_won', async () => {
      const { repo, tx } = makeRepo({
        deal: { ...wonDeal, stage: 'negotiation' },
      });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.contact.create).not.toHaveBeenCalled();
    });

    it('400 when the deal has no lead', async () => {
      const { repo } = makeRepo({ deal: { ...wonDeal, leadId: null } });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when the lead is gone', async () => {
      const { repo } = makeRepo({ lead: null });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 on "create" when another contact has the same email (strong match)', async () => {
      const { repo, tx } = makeRepo({
        emailMatches: [existingContact('c9', { email: 'sara@x.com' })],
      });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create', acknowledgeDuplicate: true },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.contact.create).not.toHaveBeenCalled();
    });

    it('409 on "create" with a phone-only match unless acknowledged', async () => {
      const setup = {
        phoneMatches: [existingContact('c9', { phone: '0100' })],
      };
      const a = makeRepo(setup);
      await expect(
        a.repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(a.tx.contact.create).not.toHaveBeenCalled();

      const b = makeRepo(setup);
      const result = await b.repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create', acknowledgeDuplicate: true },
        audit,
      );
      expect(result.outcome).toBe('created');
      expect(b.tx.contact.create).toHaveBeenCalledTimes(1);
    });

    it('409 on "create" when the deal already has a contact (never overwritten)', async () => {
      const { repo, tx } = makeRepo({
        deal: { ...wonDeal, contactId: 'c-own' },
        contacts: { 'c-own': existingContact('c-own') },
      });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.contact.create).not.toHaveBeenCalled();
    });

    it('404 on "link" to a contact of another company / missing', async () => {
      const { repo, tx } = makeRepo({ contacts: {} });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'link', contactId: 'foreign' },
          audit,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
    });

    it('409 on "link" to a different contact than the deal already has', async () => {
      const { repo, tx } = makeRepo({
        deal: { ...wonDeal, contactId: 'c-own' },
        contacts: {
          'c-own': existingContact('c-own'),
          c2: existingContact('c2'),
        },
      });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'link', contactId: 'c2' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
    });

    it('409 when the conditional claim updates 0 rows (lost a race) — the transaction aborts', async () => {
      const { repo } = makeRepo({ claimCount: 0 });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('409 when the lead has too many related records', async () => {
      const many = Array.from({ length: 201 }, (_, i) => ({
        id: `t${i}`,
        contactId: null,
      }));
      const { repo } = makeRepo({ tasks: many });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a P2002 from the contact unique index to a 409', async () => {
      const { repo, tx } = makeRepo();
      tx.contact.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
          meta: { target: ['email'] },
        }),
      );
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('create', () => {
    it('creates the contact, claims the lead, points the deal at it and logs — in that order', async () => {
      const { repo, tx, calls } = makeRepo();
      const result = await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );

      expect(result).toMatchObject({
        outcome: 'created',
        contactId: 'new-contact',
        leadId: 'l1',
        dealId: 'd1',
        relinked: { deals: 0, tasks: 0, calendarEvents: 0 },
      });

      const order = calls.filter((c) =>
        [
          'lock',
          'contact.create',
          'lead.updateMany',
          'deal.update',
          'activity.SYSTEM',
        ].includes(c),
      );
      expect(order).toEqual([
        'lock',
        'contact.create',
        'lead.updateMany',
        'deal.update',
        'activity.SYSTEM',
      ]);

      expect(tx.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId,
          createdById: 'actor-1',
          firstName: 'Sara',
          email: 'sara@x.com',
          status: 'customer',
          notes: 'wants a demo',
          assignedToId: 'u1',
        }),
      });
      // lead is claimed only while still unconverted
      expect(tx.lead.updateMany).toHaveBeenCalledWith({
        where: { id: 'l1', companyId, deletedAt: null, convertedAt: null },
        data: expect.objectContaining({
          status: 'converted',
          convertedContactId: 'new-contact',
          convertedByDealId: 'd1',
        }),
      });
      // deal.contactId set, leadId untouched
      expect(tx.deal.update).toHaveBeenCalledWith({
        where: { id: 'd1', companyId, deletedAt: null },
        data: { contactId: 'new-contact' },
      });
      // notes copied into the contact => no duplicate NOTE activity
      expect(calls).not.toContain('activity.NOTE');
      expect(auditedEntities(tx)).toEqual(
        expect.arrayContaining(['contact', 'lead', 'deal']),
      );
    });

    it('takes the company-scoped advisory lock first and runs in ONE transaction', async () => {
      const { repo, prisma, calls } = makeRepo();
      await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(calls[0]).toBe('lock');
    });

    it('drops an inactive/foreign assignee instead of assigning the contact to them', async () => {
      const { repo, tx } = makeRepo({ activeUser: false });
      await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );
      expect(tx.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ assignedToId: null }),
      });
    });

    it('re-points ONLY the other open records that have no contact and audits each', async () => {
      const { repo, tx } = makeRepo({
        otherDeals: [
          { id: 'd2', contactId: null, leadId: 'l1', title: 'x', stage: 'new' },
        ],
        tasks: [
          {
            id: 't1',
            contactId: null,
            leadId: 'l1',
            title: 't',
            status: 'open',
          },
        ],
        events: [{ id: 'e1', contactId: null, leadId: 'l1', title: 'e' }],
      });
      const result = await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );

      expect(result.relinked).toEqual({
        deals: 1,
        tasks: 1,
        calendarEvents: 1,
      });
      // the queries themselves only ever select rows with contactId: null
      expect(tx.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId,
            leadId: 'l1',
            contactId: null,
            deletedAt: null,
          }),
        }),
      );
      expect(tx.deal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: null,
            id: { not: 'd1' },
          }),
        }),
      );
      // leadId is never cleared
      for (const m of [tx.task.update, tx.calendarEvent.update]) {
        expect(m).toHaveBeenCalledWith(
          expect.objectContaining({ data: { contactId: 'new-contact' } }),
        );
      }
    });

    it('every audit row carries the one correlationId of the request', async () => {
      const { repo, tx } = makeRepo();
      await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );
      const rows = (
        tx.auditLog.create.mock.calls as unknown as Array<
          [{ data: Record<string, unknown> }]
        >
      ).map((c) => c[0].data);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const row of rows) {
        expect(row.correlationId).toBe('corr-1');
        expect(row.companyId).toBe(companyId);
      }
    });
  });

  describe('link', () => {
    const contacts = { c2: existingContact('c2', { email: 'sara@x.com' }) };

    it('links to the chosen contact WITHOUT creating or modifying it, keeps the lead notes as a NOTE', async () => {
      const { repo, tx, calls } = makeRepo({
        contacts,
        emailMatches: [contacts.c2],
      });
      const result = await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'link', contactId: 'c2' },
        audit,
      );

      expect(result).toMatchObject({ outcome: 'linked', contactId: 'c2' });
      expect(tx.contact.create).not.toHaveBeenCalled();
      expect(calls).toContain('activity.NOTE');
      expect(tx.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'NOTE',
          description: 'wants a demo',
          contactId: 'c2',
        }),
      });
      expect(auditedEntities(tx)).not.toContain('contact');
    });

    it('is allowed even when an email match exists (that is the point of linking)', async () => {
      const { repo } = makeRepo({ contacts, emailMatches: [contacts.c2] });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'link', contactId: 'c2' },
          audit,
        ),
      ).resolves.toMatchObject({ outcome: 'linked' });
    });

    it('does not rewrite a deal that already points at the chosen contact', async () => {
      const { repo, tx } = makeRepo({
        deal: { ...wonDeal, contactId: 'c2' },
        contacts,
      });
      await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'link', contactId: 'c2' },
        audit,
      );
      expect(tx.deal.update).not.toHaveBeenCalled();
    });

    it('writes no NOTE when the lead has no notes', async () => {
      const { repo, calls } = makeRepo({
        contacts,
        lead: { ...lead, notes: null },
      });
      await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'link', contactId: 'c2' },
        audit,
      );
      expect(calls).not.toContain('activity.NOTE');
    });
  });

  describe('already converted (idempotent replay)', () => {
    const converted = {
      ...lead,
      status: 'converted',
      convertedAt: new Date(),
      convertedContactId: 'c-prev',
    };

    it('returns already_converted with the same contact and creates/claims nothing', async () => {
      const { repo, tx } = makeRepo({
        lead: converted,
        deal: { ...wonDeal, contactId: 'c-prev' },
      });
      const result = await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );
      expect(result).toMatchObject({
        outcome: 'already_converted',
        contactId: 'c-prev',
      });
      expect(tx.contact.create).not.toHaveBeenCalled();
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
      expect(tx.activity.create).not.toHaveBeenCalled();
      expect(tx.deal.update).not.toHaveBeenCalled();
    });

    it('attaches a second won deal that has no contact to the existing contact', async () => {
      const { repo, tx } = makeRepo({
        lead: converted,
        contacts: { 'c-prev': existingContact('c-prev') },
      });
      const result = await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );
      expect(result.relinked.deals).toBe(1);
      expect(tx.deal.update).toHaveBeenCalledWith({
        where: { id: 'd1', companyId, deletedAt: null },
        data: { contactId: 'c-prev' },
      });
    });

    it('never overwrites the deal contact of a second deal', async () => {
      const { repo, tx } = makeRepo({
        lead: converted,
        deal: { ...wonDeal, contactId: 'c-other' },
      });
      await repo.convert(
        companyId,
        'd1',
        'actor-1',
        { resolution: 'create' },
        audit,
      );
      expect(tx.deal.update).not.toHaveBeenCalled();
    });

    it('409 when the lead is converted but its contact pointer is gone (contact deleted + SetNull)', async () => {
      const { repo } = makeRepo({
        lead: { ...converted, convertedContactId: null },
      });
      await expect(
        repo.convert(
          companyId,
          'd1',
          'actor-1',
          { resolution: 'create' },
          audit,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

describe('LeadConversionRepository.preview', () => {
  it('404 for a deal outside the company', async () => {
    const { repo } = makeRepo({ deal: null });
    await expect(repo.preview(companyId, 'd1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports ineligible (and exposes no proposed contact) for a deal that is not won', async () => {
    const { repo, tx } = makeRepo({ deal: { ...wonDeal, stage: 'qualified' } });
    const preview = await repo.preview(companyId, 'd1');
    expect(preview).toMatchObject({
      eligible: false,
      reason: 'deal_not_won',
      proposedContact: null,
      candidates: [],
    });
    expect(tx.contact.findMany).not.toHaveBeenCalled();
  });

  it('is eligible for a won deal, proposes the contact and lists duplicates', async () => {
    const dup = existingContact('c9', { email: 'sara@x.com' });
    const { repo, tx } = makeRepo({ emailMatches: [dup] });
    const preview = await repo.preview(companyId, 'd1');

    expect(preview.eligible).toBe(true);
    expect(preview.proposedContact).toMatchObject({
      firstName: 'Sara',
      status: 'customer',
    });
    expect(preview.candidates).toHaveLength(1);
    expect(preview.duplicate).toEqual({
      blocksCreate: true,
      requiresAcknowledgement: false,
    });
    // company scoping on every candidate query
    for (const call of tx.contact.findMany.mock.calls) {
      expect(
        (call[0] as { where: { companyId: string } }).where.companyId,
      ).toBe(companyId);
    }
  });

  it('is READ-ONLY: never opens a transaction or writes', async () => {
    const { repo, prisma, tx } = makeRepo();
    await repo.preview(companyId, 'd1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.contact.create).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('reports an already-converted lead as not eligible with the existing contact', async () => {
    const convertedAt = new Date();
    const { repo } = makeRepo({
      lead: {
        ...lead,
        status: 'converted',
        convertedAt,
        convertedContactId: 'c-prev',
      },
    });
    const preview = await repo.preview(companyId, 'd1');
    expect(preview.eligible).toBe(false);
    expect(preview.alreadyConverted).toEqual({
      contactId: 'c-prev',
      convertedAt,
    });
  });
});
