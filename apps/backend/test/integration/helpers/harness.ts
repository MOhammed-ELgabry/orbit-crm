/**
 * Integration-test harness: data lifecycle only (no Nest, no HTTP, no auth).
 *
 * What it does
 *   - Opens its own PrismaClient against the validated test database and
 *     proves, with `SELECT current_database()`, that it really is
 *     `orbitcrm_test` before any cleanup or orphan recovery can run.
 *   - Keeps a ledger of the IDs of everything a test run created.
 *   - cleanup() deletes ONLY those IDs, children before parents, and only
 *     after EVERY ID in the ledger has been proven to be test data.
 *   - recoverOrphans() finds old, clearly-marked leftovers of a crashed run,
 *     collects their IDs first, then uses the very same discover -> validate
 *     -> delete pipeline, company by company.
 *
 * Hard rules enforced here
 *   - Order is always: discover -> validate EVERY id -> delete. If any
 *     validation fails nothing is deleted.
 *   - Every delete is `where: { id: { in: <registered ids> } }` (or
 *     `roleId: { in: ... }` for RolePermission, which has no `id`).
 *   - An empty ID list never reaches Prisma.
 *   - No TRUNCATE / DROP / raw DELETE / updateMany / deleteMany({}) anywhere.
 *   - Permission rows and `_prisma_migrations` are never touched.
 *
 * Typical use (see the integration specs):
 *   const harness = await createTestHarness();
 *   await harness.recoverOrphans();            // beforeAll
 *   ... create fixtures, calling harness.registerX(id) for each ...
 *   await harness.cleanup();                   // afterAll
 *   await harness.close();
 */
import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';

import * as testDatabaseGuard from '../../support/test-database-guard';

// The guard is plain CommonJS JavaScript; describe only what is used here.
interface TestDatabaseGuard {
  ALLOWED_DATABASE_NAME: string;
  assertSafeTestDatabaseUrl(
    testUrl: string | undefined,
    otherUrls?: string[],
  ): unknown;
}

const guard = testDatabaseGuard as unknown as TestDatabaseGuard;

/** Prefix of every company name created by the integration tests. */
export const MARKER_PREFIX = '__orbit_it__';
/** Reserved TLD (RFC 2606): an address here can never belong to a real user. */
export const MARKER_EMAIL_DOMAIN = 'orbit-it.invalid';
/** Orphan recovery only considers data older than this. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
/** Upper bound of companies one orphan-recovery call may touch. */
const ORPHAN_BATCH_LIMIT = 100;
/** How many violations an error message lists (the rest are counted). */
const MAX_LISTED_VIOLATIONS = 10;

const UUID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const COMPANY_MARKER_PATTERN = new RegExp(
  `^${MARKER_PREFIX}${UUID_SOURCE}( .*)?$`,
);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class HarnessSafetyError extends Error {
  constructor(message: string) {
    super(`[integration-harness] ${message}`);
    this.name = 'HarnessSafetyError';
  }
}

/** Thrown when an ID in the ledger cannot be proven to be test data. */
export class LedgerValidationError extends HarnessSafetyError {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerValidationError';
  }
}

/** IDs of everything a run created. Extend with new Sets for new models. */
interface IdLedger {
  createdCompanyIds: Set<string>;
  createdRoleIds: Set<string>;
  createdUserIds: Set<string>;
  createdContactIds: Set<string>;
  createdSessionIds: Set<string>;
}

export type CreatedIds = { [K in keyof IdLedger]: string[] };

export interface DeletedCounts {
  authSession: number;
  contact: number;
  rolePermission: number;
  user: number;
  role: number;
  company: number;
}

export interface CleanupReport {
  deleted: DeletedCounts;
  /** Orphan recovery only: marker companies skipped because a record of theirs failed validation. */
  skippedCompanyIds: string[];
}

export interface TestHarness {
  readonly runId: string;
  /** Prisma client already verified to be connected to `orbitcrm_test`. */
  readonly prisma: PrismaClient;

  /** Marker-carrying values for fixtures: required for cleanup to accept them. */
  uniqueName(label: string): string;
  uniqueEmail(label: string): string;

  registerCompany(id: string): void;
  registerRole(id: string): void;
  registerUser(id: string): void;
  registerContact(id: string): void;
  registerSession(id: string): void;
  createdIds(): CreatedIds;

  assertDatabaseIdentity(): Promise<void>;
  cleanup(): Promise<CleanupReport>;
  recoverOrphans(): Promise<CleanupReport>;
  close(): Promise<void>;
}

function newLedger(): IdLedger {
  return {
    createdCompanyIds: new Set(),
    createdRoleIds: new Set(),
    createdUserIds: new Set(),
    createdContactIds: new Set(),
    createdSessionIds: new Set(),
  };
}

function mergeLedger(target: IdLedger, source: IdLedger): void {
  (Object.keys(target) as Array<keyof IdLedger>).forEach((key) => {
    source[key].forEach((id) => target[key].add(id));
  });
}

function emptyCounts(): DeletedCounts {
  return {
    authSession: 0,
    contact: 0,
    rolePermission: 0,
    user: 0,
    role: 0,
    company: 0,
  };
}

function assertValidId(kind: string, id: unknown): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new HarnessSafetyError(
      `Refusing to register an invalid ${kind} id (${typeof id}).`,
    );
  }
  return id;
}

function isMarkerEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${MARKER_EMAIL_DOMAIN}`);
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Proves the connection is really `orbitcrm_test` (not just the URL). */
async function assertDatabaseIdentity(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database() AS current_database`;

  const actual = rows[0]?.current_database;
  if (actual !== guard.ALLOWED_DATABASE_NAME) {
    throw new HarnessSafetyError(
      `Connected database is "${String(actual)}", expected "${guard.ALLOWED_DATABASE_NAME}". Nothing was deleted.`,
    );
  }
}

/**
 * READ-ONLY. Adds the children of the registered parents to the ledger so
 * they are validated and deleted by their own IDs afterwards:
 *
 *   Company
 *     |- Role
 *     |- User
 *     |    `- AuthSession
 *     `- Contact   (also those created by a registered User)
 *
 * Discovery only widens what gets VALIDATED; every discovered ID goes through
 * assertLedgerIsTestData() before anything is deleted.
 */
async function discoverChildren(
  prisma: PrismaClient,
  ledger: IdLedger,
): Promise<void> {
  const companyIds = [...ledger.createdCompanyIds];

  if (companyIds.length > 0) {
    const roles = await prisma.role.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    roles.forEach((r) => ledger.createdRoleIds.add(r.id));

    const users = await prisma.user.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    users.forEach((u) => ledger.createdUserIds.add(u.id));
  }

  const userIds = [...ledger.createdUserIds];

  const contactFilters = [
    ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
    ...(userIds.length > 0 ? [{ createdById: { in: userIds } }] : []),
  ];
  if (contactFilters.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { OR: contactFilters },
      select: { id: true },
    });
    contacts.forEach((c) => ledger.createdContactIds.add(c.id));
  }

  if (userIds.length > 0) {
    const sessions = await prisma.authSession.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    sessions.forEach((s) => ledger.createdSessionIds.add(s.id));
  }
}

/**
 * READ-ONLY. Proves that EVERY ID in the ledger (registered or discovered)
 * exists and is test data, following the real foreign keys:
 *
 *   Company      exists, name matches the marker pattern
 *   User         exists, marker e-mail domain, companyId is a proven Company
 *   Role         exists, companyId is a proven Company
 *   Contact      exists, companyId is a proven Company AND createdById is a
 *                proven User
 *   AuthSession  exists, userId is a proven User
 *
 * "Proven" means: present in the ledger, found in the database and valid
 * above. A missing record is a failure, never a silent success, because its
 * lineage can no longer be shown. All problems are collected, then ONE
 * LedgerValidationError is thrown; callers delete nothing in that case.
 */
async function assertLedgerIsTestData(
  prisma: PrismaClient,
  ledger: IdLedger,
): Promise<void> {
  const violations: string[] = [];

  const reportMissing = (
    kind: string,
    requested: string[],
    found: Array<{ id: string }>,
  ): void => {
    const foundIds = new Set(found.map((row) => row.id));
    requested
      .filter((id) => !foundIds.has(id))
      .forEach((id) =>
        violations.push(`${kind} ${id}: not found, lineage cannot be proven`),
      );
  };

  // 1. Companies: the root of the lineage.
  const companyIds = [...ledger.createdCompanyIds];
  const companies =
    companyIds.length === 0
      ? []
      : await prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, name: true },
        });
  reportMissing('company', companyIds, companies);

  const provenCompanyIds = new Set<string>();
  for (const company of companies) {
    if (COMPANY_MARKER_PATTERN.test(company.name)) {
      provenCompanyIds.add(company.id);
    } else {
      violations.push(
        `company ${company.id}: name does not carry the "${MARKER_PREFIX}" marker`,
      );
    }
  }

  // 2. Users: marker e-mail domain AND belong to a proven company.
  const userIds = [...ledger.createdUserIds];
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, companyId: true },
        });
  reportMissing('user', userIds, users);

  const provenUserIds = new Set<string>();
  for (const user of users) {
    if (!isMarkerEmail(user.email)) {
      violations.push(
        `user ${user.id}: e-mail is not on the @${MARKER_EMAIL_DOMAIN} marker domain`,
      );
    } else if (user.companyId === null) {
      violations.push(
        `user ${user.id}: has no company, lineage cannot be proven`,
      );
    } else if (!provenCompanyIds.has(user.companyId)) {
      violations.push(
        `user ${user.id}: company ${user.companyId} is not a proven test company`,
      );
    } else {
      provenUserIds.add(user.id);
    }
  }

  // 3. Roles: must belong to a proven company.
  const roleIds = [...ledger.createdRoleIds];
  const roles =
    roleIds.length === 0
      ? []
      : await prisma.role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, companyId: true },
        });
  reportMissing('role', roleIds, roles);

  for (const role of roles) {
    if (!provenCompanyIds.has(role.companyId)) {
      violations.push(
        `role ${role.id}: company ${role.companyId} is not a proven test company`,
      );
    }
  }

  // 4. Contacts: proven company AND created by a proven user.
  const contactIds = [...ledger.createdContactIds];
  const contacts =
    contactIds.length === 0
      ? []
      : await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, companyId: true, createdById: true },
        });
  reportMissing('contact', contactIds, contacts);

  for (const contact of contacts) {
    if (!provenCompanyIds.has(contact.companyId)) {
      violations.push(
        `contact ${contact.id}: company ${contact.companyId} is not a proven test company`,
      );
    } else if (!provenUserIds.has(contact.createdById)) {
      violations.push(
        `contact ${contact.id}: creator ${contact.createdById} is not a proven test user`,
      );
    }
  }

  // 5. Sessions: must belong to a proven user.
  const sessionIds = [...ledger.createdSessionIds];
  const sessions =
    sessionIds.length === 0
      ? []
      : await prisma.authSession.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, userId: true },
        });
  reportMissing('session', sessionIds, sessions);

  for (const session of sessions) {
    if (!provenUserIds.has(session.userId)) {
      violations.push(
        `session ${session.id}: user ${session.userId} is not a proven test user`,
      );
    }
  }

  if (violations.length > 0) {
    const listed = violations.slice(0, MAX_LISTED_VIOLATIONS).join('; ');
    const rest = violations.length - MAX_LISTED_VIOLATIONS;
    throw new LedgerValidationError(
      `Refusing cleanup, NOTHING was deleted. ${violations.length} problem(s): ${listed}${rest > 0 ? `; and ${rest} more` : ''}.`,
    );
  }
}

/** The only place a delete is issued: empty lists never reach Prisma. */
async function deleteByIds(
  label: string,
  ids: string[],
  run: (ids: string[]) => Promise<{ count: number }>,
): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0;
  }
  try {
    return (await run(ids)).count;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HarnessSafetyError(
      `Cleanup stopped while deleting ${label}: ${reason}`,
    );
  }
}

/**
 * Discover -> validate EVERY id -> delete by IDs, children first.
 * Validation finishes before the first DELETE; if it fails nothing is deleted.
 *
 * Order follows the real foreign keys (prisma/schema.prisma + migrations):
 *   AuthSession -> User (cascade)          deleted first, explicit anyway
 *   Contact.createdById -> User (RESTRICT) contacts must go before users
 *   RolePermission -> Role (cascade)       by roleId, before roles
 *   User.roleId -> Role (SET NULL)         users before roles
 *   User.companyId -> Company (SET NULL)   users before the company
 *   Role/Contact.companyId -> Company (cascade), company last
 * Permission and `_prisma_migrations` are never touched.
 *
 * Each ID is removed from the ledger as soon as its step succeeds, so after a
 * failed step the ledger holds exactly what is still left to delete and a
 * retry validates only the remaining rows.
 */
async function deleteLedger(
  prisma: PrismaClient,
  ledger: IdLedger,
): Promise<DeletedCounts> {
  await discoverChildren(prisma, ledger);
  await assertLedgerIsTestData(prisma, ledger);

  const counts = emptyCounts();

  counts.authSession = await deleteByIds(
    'AuthSession',
    [...ledger.createdSessionIds],
    (ids) => prisma.authSession.deleteMany({ where: { id: { in: ids } } }),
  );
  ledger.createdSessionIds.clear();

  counts.contact = await deleteByIds(
    'Contact',
    [...ledger.createdContactIds],
    (ids) => prisma.contact.deleteMany({ where: { id: { in: ids } } }),
  );
  ledger.createdContactIds.clear();

  counts.rolePermission = await deleteByIds(
    'RolePermission',
    [...ledger.createdRoleIds],
    (ids) =>
      prisma.rolePermission.deleteMany({ where: { roleId: { in: ids } } }),
  );

  counts.user = await deleteByIds('User', [...ledger.createdUserIds], (ids) =>
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  );
  ledger.createdUserIds.clear();

  counts.role = await deleteByIds('Role', [...ledger.createdRoleIds], (ids) =>
    prisma.role.deleteMany({ where: { id: { in: ids } } }),
  );
  ledger.createdRoleIds.clear();

  counts.company = await deleteByIds(
    'Company',
    [...ledger.createdCompanyIds],
    (ids) => prisma.company.deleteMany({ where: { id: { in: ids } } }),
  );
  ledger.createdCompanyIds.clear();

  return counts;
}

/**
 * Orphans = marker companies from a crashed run: name matches
 * `__orbit_it__<uuid>[ label]`, older than one hour, not part of this run.
 *
 * Each candidate goes through discover -> validate on its own. A company
 * whose records fail validation (e.g. a user with a real e-mail) is skipped
 * entirely and reported; nothing of it is deleted. The companies that pass
 * are merged into one ledger and removed with the regular ID-based pipeline,
 * which validates once more before the first DELETE.
 */
async function recoverOrphanCompanies(
  prisma: PrismaClient,
  currentLedger: IdLedger,
): Promise<CleanupReport> {
  const cutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

  const candidates = await prisma.company.findMany({
    where: {
      name: { startsWith: MARKER_PREFIX },
      createdAt: { lt: cutoff },
    },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
    take: ORPHAN_BATCH_LIMIT,
  });

  const candidateIds = candidates
    .filter(
      (c) =>
        COMPANY_MARKER_PATTERN.test(c.name) &&
        !currentLedger.createdCompanyIds.has(c.id),
    )
    .map((c) => c.id);

  const orphanLedger = newLedger();
  const skippedCompanyIds: string[] = [];

  for (const id of candidateIds) {
    const single = newLedger();
    single.createdCompanyIds.add(id);
    try {
      await discoverChildren(prisma, single);
      await assertLedgerIsTestData(prisma, single);
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        skippedCompanyIds.push(id);
        continue;
      }
      throw error;
    }
    mergeLedger(orphanLedger, single);
  }

  if (orphanLedger.createdCompanyIds.size === 0) {
    return { deleted: emptyCounts(), skippedCompanyIds };
  }

  const deleted = await deleteLedger(prisma, orphanLedger);
  return { deleted, skippedCompanyIds };
}

export async function createTestHarness(): Promise<TestHarness> {
  if (process.env.NODE_ENV !== 'test') {
    throw new HarnessSafetyError(
      'NODE_ENV is not "test": integration/setup/test-env.ts did not run.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl !== 'string') {
    throw new HarnessSafetyError('DATABASE_URL is not set.');
  }
  // Same guard as the setup file and db:test:migrate: throws unless the URL is
  // the local `orbitcrm_test` database. DATABASE_URL is never trusted blindly.
  guard.assertSafeTestDatabaseUrl(databaseUrl);

  // A dedicated client (not Nest's PrismaService): the data lifecycle must
  // work before the app boots, after it closes, and if it failed to boot.
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl.trim() });

  try {
    await prisma.$connect();
    await assertDatabaseIdentity(prisma);
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }

  const runId = randomUUID();
  const ledger = newLedger();

  return {
    runId,
    prisma,

    uniqueName: (label) => `${MARKER_PREFIX}${runId} ${slug(label)}`,
    uniqueEmail: (label) =>
      `orbit-it-${runId}-${slug(label)}@${MARKER_EMAIL_DOMAIN}`,

    registerCompany: (id) => {
      ledger.createdCompanyIds.add(assertValidId('company', id));
    },
    registerRole: (id) => {
      ledger.createdRoleIds.add(assertValidId('role', id));
    },
    registerUser: (id) => {
      ledger.createdUserIds.add(assertValidId('user', id));
    },
    registerContact: (id) => {
      ledger.createdContactIds.add(assertValidId('contact', id));
    },
    registerSession: (id) => {
      ledger.createdSessionIds.add(assertValidId('session', id));
    },
    createdIds: () => ({
      createdCompanyIds: [...ledger.createdCompanyIds],
      createdRoleIds: [...ledger.createdRoleIds],
      createdUserIds: [...ledger.createdUserIds],
      createdContactIds: [...ledger.createdContactIds],
      createdSessionIds: [...ledger.createdSessionIds],
    }),

    assertDatabaseIdentity: () => assertDatabaseIdentity(prisma),

    async cleanup() {
      await assertDatabaseIdentity(prisma);
      // deleteLedger empties each ledger Set as its step succeeds; if a step
      // fails the remaining IDs stay registered (visible, retryable).
      const deleted = await deleteLedger(prisma, ledger);
      return { deleted, skippedCompanyIds: [] };
    },

    async recoverOrphans() {
      await assertDatabaseIdentity(prisma);
      return recoverOrphanCompanies(prisma, ledger);
    },

    close: () => prisma.$disconnect(),
  };
}
