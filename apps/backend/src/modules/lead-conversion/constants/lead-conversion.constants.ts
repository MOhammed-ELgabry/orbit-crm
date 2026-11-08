export const LEAD_CONVERSION_REPOSITORY = Symbol('LEAD_CONVERSION_REPOSITORY');

/**
 * What the user decided in the confirmation dialog:
 *  - create: make a brand-new Contact from the Lead.
 *  - link:   attach the Lead (and the Deal) to a Contact that already exists
 *            in the same company. The existing Contact is NEVER modified —
 *            there is no automatic merge.
 */
export const LEAD_CONVERSION_RESOLUTIONS = ['create', 'link'] as const;

/**
 * Contact.status given to a Contact that is created by a conversion. The
 * Lead's own status is not copied (Lead and Contact have different
 * lifecycles); a Lead that won a Deal is, by definition, a customer.
 */
export const CONVERTED_CONTACT_STATUS = 'customer' as const;

/**
 * Max number of rows of EACH kind (other Deals, Tasks, CalendarEvents of the
 * Lead) the conversion re-points to the new Contact inside its single
 * transaction. A bound keeps the transaction (and its per-row audit trail)
 * short; a Lead with more than this many related rows of one kind is refused
 * with a clear 409 instead of half-converting or holding a long lock.
 */
export const LEAD_CONVERSION_MAX_RELATED = 200;

/** Max number of duplicate candidates returned per match key. */
export const LEAD_CONVERSION_CANDIDATE_LIMIT = 10;

/** Interactive-transaction limits (Prisma defaults are 2s wait / 5s run). */
export const LEAD_CONVERSION_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 20_000,
} as const;
