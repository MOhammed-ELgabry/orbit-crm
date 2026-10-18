import { buildContactTimelineFilter } from './contact-timeline.filter';

/**
 * The filter is a pure function. Two kinds of test live here:
 *
 *  1. Behavioural: the produced `where` is evaluated by a tiny, deliberately
 *     STRICT interpreter (it throws on any key it does not know) against an
 *     in-memory data set that includes inconsistent, cross-company rows. This
 *     proves which rows the filter can match without a database, and it does
 *     not break when the filter is merely re-arranged. It does NOT replace
 *     the PostgreSQL proof: whether Prisma/PostgreSQL honours the shape end to
 *     end is covered by test/integration/activities/*.int-spec.ts.
 *  2. Structural invariants that must hold for every branch.
 */

type Row = Record<string, unknown>;

type Model = 'activity' | 'deal' | 'task' | 'calendarEvent' | 'contact';

const TABLE_OF: Record<Model, string> = {
  activity: 'activities',
  deal: 'deals',
  task: 'tasks',
  calendarEvent: 'calendarEvents',
  contact: 'contacts',
};

/** relation name -> [target model, foreign-key column on the owning row] */
const RELATIONS: Record<string, Record<string, [Model, string]>> = {
  activity: {
    contact: ['contact', 'contactId'],
    deal: ['deal', 'dealId'],
    task: ['task', 'taskId'],
    calendarEvent: ['calendarEvent', 'calendarEventId'],
  },
  deal: { contact: ['contact', 'contactId'] },
  task: { contact: ['contact', 'contactId'] },
  calendarEvent: { contact: ['contact', 'contactId'] },
  contact: {},
};

type Tables = Record<string, Row[]>;

function matches(
  tables: Tables,
  model: Model,
  row: Row,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Array<Record<string, unknown>>).some((branch) =>
        matches(tables, model, row, branch),
      );
    }
    if (key === 'AND') {
      return (condition as Array<Record<string, unknown>>).every((branch) =>
        matches(tables, model, row, branch),
      );
    }

    const relation = RELATIONS[model][key];
    if (relation) {
      const [targetModel, foreignKey] = relation;
      const target = tables[TABLE_OF[targetModel]].find(
        (candidate) => candidate.id === row[foreignKey],
      );
      const nested = (condition as { is?: Record<string, unknown> }).is;
      if (nested === undefined) {
        throw new Error(`Unsupported relation filter on "${key}"`);
      }
      return (
        target !== undefined && matches(tables, targetModel, target, nested)
      );
    }

    if (typeof condition === 'string' || condition === null) {
      return row[key] === condition;
    }
    throw new Error(`Unsupported condition on "${key}"`);
  });
}

describe('buildContactTimelineFilter', () => {
  const companyId = 'company-a';
  const contactId = 'contact-a1';

  // Rows are written the way each source writes them. Company B rows that
  // point at company-A rows are INCONSISTENT on purpose (single-column FKs
  // allow them; the services never create them).
  const tables: Tables = {
    contacts: [
      { id: 'contact-a1', companyId: 'company-a' },
      { id: 'contact-a2', companyId: 'company-a' },
      { id: 'contact-b1', companyId: 'company-b' },
    ],
    deals: [
      { id: 'deal-a1', companyId: 'company-a', contactId: 'contact-a1' },
      { id: 'deal-a2', companyId: 'company-a', contactId: 'contact-a2' },
      { id: 'deal-a-none', companyId: 'company-a', contactId: null },
      { id: 'deal-b1', companyId: 'company-b', contactId: 'contact-b1' },
      // company-B deal -> company-A contact
      { id: 'deal-bxa', companyId: 'company-b', contactId: 'contact-a1' },
      // company-A deal -> company-B contact
      { id: 'deal-axb', companyId: 'company-a', contactId: 'contact-b1' },
    ],
    tasks: [
      { id: 'task-a1', companyId: 'company-a', contactId: 'contact-a1' },
      { id: 'task-bxa', companyId: 'company-b', contactId: 'contact-a1' },
      { id: 'task-axb', companyId: 'company-a', contactId: 'contact-b1' },
    ],
    calendarEvents: [
      { id: 'event-a1', companyId: 'company-a', contactId: 'contact-a1' },
      { id: 'event-bxa', companyId: 'company-b', contactId: 'contact-a1' },
      { id: 'event-axb', companyId: 'company-a', contactId: 'contact-b1' },
    ],
    activities: [
      { id: 'manual-a1', companyId: 'company-a', contactId: 'contact-a1' },
      { id: 'manual-a2', companyId: 'company-a', contactId: 'contact-a2' },
      { id: 'deal-event-a1', companyId: 'company-a', dealId: 'deal-a1' },
      { id: 'deal-event-a2', companyId: 'company-a', dealId: 'deal-a2' },
      { id: 'deal-event-none', companyId: 'company-a', dealId: 'deal-a-none' },
      { id: 'task-event-a1', companyId: 'company-a', taskId: 'task-a1' },
      {
        id: 'event-event-a1',
        companyId: 'company-a',
        calendarEventId: 'event-a1',
      },
      {
        id: 'two-paths',
        companyId: 'company-a',
        contactId: 'contact-a1',
        dealId: 'deal-a1',
      },
      { id: 'no-links', companyId: 'company-a' },
      // company-B activities that reference company-A data
      { id: 'b-manual-xa', companyId: 'company-b', contactId: 'contact-a1' },
      { id: 'b-on-deal-a1', companyId: 'company-b', dealId: 'deal-a1' },
      { id: 'b-on-deal-bxa', companyId: 'company-b', dealId: 'deal-bxa' },
      { id: 'b-on-task-bxa', companyId: 'company-b', taskId: 'task-bxa' },
      {
        id: 'b-on-event-bxa',
        companyId: 'company-b',
        calendarEventId: 'event-bxa',
      },
      // company-A activities that reference company-B data
      { id: 'a-manual-xb', companyId: 'company-a', contactId: 'contact-b1' },
      { id: 'a-on-deal-bxa', companyId: 'company-a', dealId: 'deal-bxa' },
      { id: 'a-on-deal-axb', companyId: 'company-a', dealId: 'deal-axb' },
      { id: 'a-on-task-axb', companyId: 'company-a', taskId: 'task-axb' },
      {
        id: 'a-on-event-axb',
        companyId: 'company-a',
        calendarEventId: 'event-axb',
      },
      // company-B's own legitimate rows
      { id: 'b-manual-b1', companyId: 'company-b', contactId: 'contact-b1' },
      { id: 'b-on-deal-b1', companyId: 'company-b', dealId: 'deal-b1' },
    ],
  };

  /**
   * What the repository returns: the filter AND-ed with the tenant scope
   * (`Activity.companyId = <caller>`), never the filter alone.
   */
  function timelineOf(callerCompanyId: string, forContactId: string): string[] {
    const filter = buildContactTimelineFilter(callerCompanyId, forContactId);

    return tables.activities
      .filter(
        (row) =>
          row.companyId === callerCompanyId &&
          matches(tables, 'activity', row, filter as Record<string, unknown>),
      )
      .map((row) => row.id as string)
      .sort();
  }

  describe('behaviour on consistent and inconsistent data', () => {
    it("returns the contact's manual activities and the lifecycle events of its deals, tasks and calendar events", () => {
      expect(timelineOf('company-a', 'contact-a1')).toEqual(
        [
          'manual-a1',
          'deal-event-a1',
          'task-event-a1',
          'event-event-a1',
          'two-paths',
        ].sort(),
      );
    });

    it('returns an activity reachable through two paths exactly once', () => {
      const ids = timelineOf('company-a', 'contact-a1');

      expect(ids.filter((id) => id === 'two-paths')).toHaveLength(1);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("excludes other contacts', unowned and unlinked activities", () => {
      const ids = timelineOf('company-a', 'contact-a1');

      for (const other of [
        'manual-a2',
        'deal-event-a2',
        'deal-event-none',
        'no-links',
      ]) {
        expect(ids).not.toContain(other);
      }
    });

    it("never returns another company's rows for the caller's own contact, even when they reference its ids", () => {
      const ids = timelineOf('company-a', 'contact-a1');

      for (const foreign of [
        'b-manual-xa',
        'b-on-deal-a1',
        'b-on-deal-bxa',
        'b-on-task-bxa',
        'b-on-event-bxa',
      ]) {
        expect(ids).not.toContain(foreign);
      }
    });

    it("does not follow the caller's activity into another company's deal, even when that deal points at the caller's contact", () => {
      expect(timelineOf('company-a', 'contact-a1')).not.toContain(
        'a-on-deal-bxa',
      );
    });

    it('returns NOTHING when company B asks for a company-A contact, even though company B owns rows that point at it (the regression found with PostgreSQL)', () => {
      // b-manual-xa (activity.contactId), b-on-deal-bxa (deal-bxa),
      // b-on-task-bxa (task-bxa) and b-on-event-bxa (event-bxa) are all
      // company-B rows whose contact is the company-A contact.
      expect(timelineOf('company-b', 'contact-a1')).toEqual([]);
    });

    it('returns NOTHING when company A asks for a company-B contact, even though company A owns rows that point at it', () => {
      expect(timelineOf('company-a', 'contact-b1')).toEqual([]);
    });

    it("gives each company its own contact's timeline and nothing else", () => {
      expect(timelineOf('company-b', 'contact-b1')).toEqual(
        ['b-manual-b1', 'b-on-deal-b1'].sort(),
      );
    });

    it('returns nothing for a contact id that does not exist at all', () => {
      expect(timelineOf('company-a', 'no-such-contact')).toEqual([]);
    });
  });

  describe('structure', () => {
    it('is a single top-level OR so that the caller can AND it with other filters', () => {
      const filter = buildContactTimelineFilter(companyId, contactId);

      expect(Object.keys(filter)).toEqual(['OR']);
      expect(filter.OR).toHaveLength(4);
    });

    it('requires, in EVERY branch, that the contact itself belongs to the caller company', () => {
      const filter = buildContactTimelineFilter(companyId, contactId);
      const ownership = '"contact":{"is":{"companyId":"company-a"}}';

      for (const branch of filter.OR as Array<Record<string, unknown>>) {
        expect(JSON.stringify(branch)).toContain(ownership);
      }
    });

    it('requires every related source row (deal, task, calendar event) to belong to the caller company too', () => {
      const filter = buildContactTimelineFilter(companyId, contactId);
      const branches = filter.OR as Array<Record<string, unknown>>;

      for (const key of ['deal', 'task', 'calendarEvent']) {
        const branch = branches.find((b) => key in b) as Record<
          string,
          { is: { companyId: string; contactId: string } }
        >;

        expect(branch[key].is.companyId).toBe(companyId);
        expect(branch[key].is.contactId).toBe(contactId);
      }
    });

    it('never matches on a name, title or description - only on ids', () => {
      const serialized = JSON.stringify(
        buildContactTimelineFilter(companyId, contactId),
      );

      expect(serialized).not.toMatch(/title|description|contains|firstName/);
    });

    it('is a pure function: separate calls never share state', () => {
      const first = buildContactTimelineFilter('company-a', 'contact-1');
      const second = buildContactTimelineFilter('company-b', 'contact-2');

      expect(JSON.stringify(first)).not.toContain('company-b');
      expect(JSON.stringify(first)).not.toContain('contact-2');
      expect(JSON.stringify(second)).not.toContain('company-a');
      expect(JSON.stringify(second)).not.toContain('contact-1');
    });
  });
});
