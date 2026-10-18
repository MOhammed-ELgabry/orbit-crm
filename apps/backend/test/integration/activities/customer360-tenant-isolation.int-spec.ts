/**
 * Customer 360 - tenant isolation and server-side enforcement (integration).
 *
 * Proves, against the real application + the real PostgreSQL test database
 * (`orbitcrm_test` only), every API the Customer 360 page relies on:
 *
 *   GET   /contacts/:id                      (header)
 *   PATCH /contacts/:id  { notes }           (notes card)
 *   GET   /activities?contactId=             (timeline)
 *   GET   /deals?contactId=                  (deals tab)
 *   GET   /tasks?contactId=                  (tasks tab)
 *   GET   /calendar?from&to&contactId=       (calendar tab)
 *
 * with company-B credentials against company-A ids, including rows that are
 * INCONSISTENT on purpose (a company-B deal / task / event / activity that
 * points at a company-A contact; single-column foreign keys allow it and the
 * services never create it):
 *
 *   1. reading a foreign record by id is a 404 that reveals nothing;
 *   2. a contact-scoped list asked for a foreign contact is an EMPTY page
 *      (rows and `total`), not company B's rows that merely reference it;
 *   3. every write that references a foreign id is rejected with 404 and the
 *      database is verified to be untouched;
 *   4. the server (not the UI) enforces permissions: a user without
 *      `contact:update` / `activity:create` gets 403 and nothing changes;
 *   5. the legitimate path still works (company A edits its own notes).
 *
 * Authentication is the real flow (POST /auth/login + the double-submit CSRF
 * cookie/header). Fixtures are created through the harness-owned Prisma
 * client; rows this spec creates beyond the harness ledger (deals, tasks,
 * calendar events, activities) are removed in afterAll, always scoped to the
 * companies this run created.
 *
 * Requires the global Permission catalog (prisma/seed.ts) like
 * test/integration/rbac/contacts-rbac.int-spec.ts: it only READS those rows.
 * Run it with: npm run db:test:migrate && npm run test:int
 */
import type { Server } from 'http';

import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../../../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../../../src/common/interceptors/response.interceptor';
import { AppModule } from '../../../src/modules/app/app.module';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const BCRYPT_ROUNDS = 10; // same cost PasswordService uses
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';
const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0);
const HOUR = 60 * 60 * 1000;

/** What the "writer" role of each company may do (read-only lookups). */
const WRITER_PERMISSIONS: ReadonlyArray<[string, string]> = [
  ['contact', 'read'],
  ['contact', 'update'],
  ['activity', 'read'],
  ['activity', 'create'],
  ['activity', 'update'],
  ['activity', 'delete'],
  ['deal', 'read'],
  ['deal', 'create'],
  ['deal', 'update'],
  ['task', 'read'],
  ['task', 'create'],
  ['task', 'update'],
  ['calendar', 'read'],
  ['calendar', 'create'],
  ['calendar', 'update'],
];

interface Tenant {
  companyId: string;
  userId: string;
  email: string;
}

interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

interface Body {
  success?: boolean;
  statusCode?: number;
  message?: string;
  data?: unknown;
  meta?: { total: number };
}

interface LoginBody {
  success: boolean;
  user: { id: string; isOwner: boolean };
}

describe('Customer 360 tenant isolation and enforcement (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let password: string;

  let tenantA: Tenant; // writer of company A
  let readerA: Tenant; // role-less (read-only by decision D2) user of company A
  let tenantB: Tenant; // writer of company B

  let writerA: Session;
  let readOnlyA: Session;
  let writerB: Session;

  const ids: Record<string, string> = {};

  const dbLedger = {
    activityIds: [] as string[],
    calendarEventIds: [] as string[],
    taskIds: [] as string[],
    dealIds: [] as string[],
  };

  // ---------------------------------------------------------------- helpers
  function cookieValue(
    setCookie: string[] | undefined,
    name: string,
  ): string | undefined {
    const entry = (setCookie ?? []).find((cookie) =>
      cookie.startsWith(`${name}=`),
    );
    return entry?.split(';')[0].slice(name.length + 1);
  }

  async function loginAs(tenant: Tenant): Promise<Session> {
    const agent = request.agent(httpServer);
    const res = await agent
      .post('/auth/login')
      .send({ email: tenant.email, password });

    expect(res.status).toBe(200);
    const csrf = cookieValue(
      res.headers['set-cookie'] as unknown as string[] | undefined,
      CSRF_COOKIE,
    );
    expect(csrf).toBeTruthy();
    const body = res.body as LoginBody;
    expect(body.user.id).toBe(tenant.userId);
    expect(body.user.isOwner).toBe(false);

    return { agent, csrf: csrf as string };
  }

  const post = (s: Session, path: string, body: Record<string, unknown>) =>
    s.agent.post(path).set(CSRF_HEADER, s.csrf).send(body);
  const patch = (s: Session, path: string, body: Record<string, unknown>) =>
    s.agent.patch(path).set(CSRF_HEADER, s.csrf).send(body);
  const del = (s: Session, path: string) =>
    s.agent.delete(path).set(CSRF_HEADER, s.csrf);

  const rowsOf = (res: { body: unknown }): Array<Record<string, unknown>> => {
    const data = (res.body as Body).data;
    return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  };
  const idsOfRows = (res: { body: unknown }): string[] =>
    rowsOf(res).map((row) => row.id as string);

  async function createTenant(
    label: string,
    roleId: string | null,
    companyId: string,
  ): Promise<Tenant> {
    const email = harness.uniqueEmail(`c360-${label}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Customer',
        lastName: label.toUpperCase(),
        email,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        isEmailVerified: true,
        isActive: true,
        isOwner: false,
        roleId,
        companyId,
      },
      select: { id: true },
    });
    harness.registerUser(user.id);
    return { companyId, userId: user.id, email };
  }

  async function createCompanyWithWriterRole(
    label: string,
    permissionIdByKey: Map<string, string>,
  ): Promise<{ companyId: string; roleId: string }> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(`c360-${label}`) },
      select: { id: true },
    });
    harness.registerCompany(company.id);

    const role = await harness.prisma.role.create({
      data: {
        companyId: company.id,
        name: harness.uniqueName(`c360-writer-${label}`),
        rolePermissions: {
          createMany: {
            data: WRITER_PERMISSIONS.map(([resource, action]) => ({
              permissionId: permissionIdByKey.get(
                `${resource}:${action}`,
              ) as string,
            })),
          },
        },
      },
      select: { id: true },
    });
    harness.registerRole(role.id);

    return { companyId: company.id, roleId: role.id };
  }

  async function createContact(tenant: Tenant, key: string, notes?: string) {
    const contact = await harness.prisma.contact.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        firstName: `Customer360${key}`,
        lastName: `Probe-${harness.runId}`,
        notes: notes ?? null,
      },
      select: { id: true },
    });
    harness.registerContact(contact.id);
    ids[key] = contact.id;
  }

  async function createDeal(tenant: Tenant, key: string, contactId: string) {
    const deal = await harness.prisma.deal.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        title: `Deal ${key}`,
        contactId,
      },
      select: { id: true },
    });
    dbLedger.dealIds.push(deal.id);
    ids[key] = deal.id;
  }

  async function createTask(tenant: Tenant, key: string, contactId: string) {
    const task = await harness.prisma.task.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        title: `Task ${key}`,
        contactId,
      },
      select: { id: true },
    });
    dbLedger.taskIds.push(task.id);
    ids[key] = task.id;
  }

  async function createEvent(tenant: Tenant, key: string, contactId: string) {
    const event = await harness.prisma.calendarEvent.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        title: `Event ${key}`,
        startAt: new Date(BASE_TIME + HOUR),
        endAt: new Date(BASE_TIME + 2 * HOUR),
        contactId,
      },
      select: { id: true },
    });
    dbLedger.calendarEventIds.push(event.id);
    ids[key] = event.id;
  }

  async function createActivity(
    tenant: Tenant,
    key: string,
    data: { contactId?: string; dealId?: string },
  ) {
    const activity = await harness.prisma.activity.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        type: 'NOTE',
        title: `Activity ${key}`,
        contactId: data.contactId ?? null,
        dealId: data.dealId ?? null,
      },
      select: { id: true },
    });
    dbLedger.activityIds.push(activity.id);
    ids[key] = activity.id;
  }

  const calendarQuery = (contactId: string) =>
    `/calendar?from=${encodeURIComponent(new Date(BASE_TIME - 24 * HOUR).toISOString())}` +
    `&to=${encodeURIComponent(new Date(BASE_TIME + 24 * HOUR).toISOString())}` +
    `&contactId=${contactId}`;

  // ------------------------------------------------------------------ setup
  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();

    // READ-ONLY lookup of the shared permission catalog (never created here).
    const permissionRows = await harness.prisma.permission.findMany({
      select: { id: true, resource: true, action: true },
    });
    const permissionIdByKey = new Map(
      permissionRows.map((p) => [`${p.resource}:${p.action}`, p.id]),
    );
    const missing = WRITER_PERMISSIONS.map(([r, a]) => `${r}:${a}`).filter(
      (key) => !permissionIdByKey.has(key),
    );
    if (missing.length > 0) {
      throw new Error(
        `The global Permission table in orbitcrm_test is missing: ${missing.join(', ')}. ` +
          'This test only READS Permission rows. Populate the permission catalog in orbitcrm_test ' +
          'deliberately (it is shared reference data: prisma/seed.ts, `npm run prisma:seed`, run ' +
          'with DATABASE_URL pointing at orbitcrm_test) and run the test again.',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new HttpExceptionFilter(),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as Server;

    const config = app.get(ConfigService);
    const cookieDomain = config.get<string>('cookies.domain');
    if (cookieDomain && cookieDomain.trim() !== '') {
      throw new Error(
        `COOKIE_DOMAIN is set ("${cookieDomain}"). The login cookies would not be sent back to 127.0.0.1; remove it from the test environment.`,
      );
    }
    if (config.get<boolean>('app.isProduction')) {
      throw new Error('Refusing to run: the app resolved to production mode.');
    }

    password = `Orbit-It-${harness.runId}`;

    const companyA = await createCompanyWithWriterRole('a', permissionIdByKey);
    const companyB = await createCompanyWithWriterRole('b', permissionIdByKey);

    tenantA = await createTenant('wa', companyA.roleId, companyA.companyId);
    readerA = await createTenant('ra', null, companyA.companyId);
    tenantB = await createTenant('wb', companyB.roleId, companyB.companyId);

    await createContact(tenantA, 'cA', 'company A private note');
    await createContact(tenantB, 'cB', 'company B private note');

    // Company A's legitimate rows for its contact.
    await createDeal(tenantA, 'dealA', ids.cA);
    await createTask(tenantA, 'taskA', ids.cA);
    await createEvent(tenantA, 'eventA', ids.cA);
    await createActivity(tenantA, 'activityA', { contactId: ids.cA });

    // Company B's legitimate rows for its own contact.
    await createDeal(tenantB, 'dealB', ids.cB);
    await createTask(tenantB, 'taskB', ids.cB);
    await createEvent(tenantB, 'eventB', ids.cB);
    await createActivity(tenantB, 'activityB', { contactId: ids.cB });

    // INCONSISTENT on purpose: company-B rows that point at the company-A
    // contact. Single-column FKs allow it; the services never create it.
    await createDeal(tenantB, 'dealBxA', ids.cA);
    await createTask(tenantB, 'taskBxA', ids.cA);
    await createEvent(tenantB, 'eventBxA', ids.cA);
    await createActivity(tenantB, 'activityBxA', { contactId: ids.cA });
    await createActivity(tenantB, 'activityOfDealBxA', {
      dealId: ids.dealBxA,
    });

    // Three logins in total (POST /auth/login is throttled to 5 per minute).
    writerA = await loginAs(tenantA);
    readOnlyA = await loginAs(readerA);
    writerB = await loginAs(tenantB);
  });

  afterAll(async () => {
    let cleanupError: unknown;

    try {
      if (app) {
        await app.close();
      }
    } catch (error) {
      cleanupError = error;
    }

    if (harness) {
      try {
        const companyIds = harness.createdIds().createdCompanyIds;

        // Children first, always scoped to companies THIS run created (also
        // catches any row a regression might have let a write create).
        if (companyIds.length > 0) {
          await harness.prisma.activity.deleteMany({
            where: { companyId: { in: companyIds } },
          });
          await harness.prisma.calendarEvent.deleteMany({
            where: { companyId: { in: companyIds } },
          });
          await harness.prisma.task.deleteMany({
            where: { companyId: { in: companyIds } },
          });
          await harness.prisma.deal.deleteMany({
            where: { companyId: { in: companyIds } },
          });
        }

        await harness.cleanup();

        const leftovers = await harness.prisma.company.count({
          where: { id: { in: companyIds } },
        });
        if (leftovers > 0) {
          throw new Error(`Cleanup left ${leftovers} companies behind`);
        }
      } catch (error) {
        cleanupError ??= error;
      } finally {
        try {
          await harness.close();
        } catch (error) {
          cleanupError ??= error;
        }
      }
    }

    if (cleanupError) {
      throw cleanupError instanceof Error
        ? cleanupError
        : new Error(`Cleanup failed: ${JSON.stringify(cleanupError)}`);
    }
  });

  // ------------------------------------------------------------------ tests
  describe('the legitimate path still works (company A)', () => {
    it('lists exactly its own rows for its own contact, from every source', async () => {
      const activities = await writerA.agent.get(
        `/activities?contactId=${ids.cA}`,
      );
      const deals = await writerA.agent.get(`/deals?contactId=${ids.cA}`);
      const tasks = await writerA.agent.get(`/tasks?contactId=${ids.cA}`);
      const events = await writerA.agent.get(calendarQuery(ids.cA));

      expect(activities.status).toBe(200);
      expect(idsOfRows(activities)).toEqual([ids.activityA]);
      expect((activities.body as Body).meta?.total).toBe(1);
      expect(idsOfRows(deals)).toEqual([ids.dealA]);
      expect((deals.body as Body).meta?.total).toBe(1);
      expect(idsOfRows(tasks)).toEqual([ids.taskA]);
      expect((tasks.body as Body).meta?.total).toBe(1);
      expect(events.status).toBe(200);
      expect(idsOfRows(events)).toEqual([ids.eventA]);
    });

    it('saves contact notes through PATCH /contacts/:id and changes nothing else', async () => {
      const before = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: ids.cA },
      });

      const res = await patch(writerA, `/contacts/${ids.cA}`, {
        notes: 'updated by company A',
      });
      expect(res.status).toBe(200);

      const after = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: ids.cA },
      });
      expect(after.notes).toBe('updated by company A');
      expect(after.companyId).toBe(before.companyId);
      expect(after.firstName).toBe(before.firstName);
      expect(after.deletedAt).toBeNull();
    });
  });

  describe('company B reading company-A ids', () => {
    it.each([
      ['contact', () => `/contacts/${ids.cA}`],
      ['activity', () => `/activities/${ids.activityA}`],
      ['deal', () => `/deals/${ids.dealA}`],
      ['task', () => `/tasks/${ids.taskA}`],
      ['calendar event', () => `/calendar/${ids.eventA}`],
    ])('answers 404 and reveals nothing for a foreign %s', async (_n, url) => {
      const res = await writerB.agent.get(url());

      expect(res.status).toBe(404);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('company A');
      expect(serialized).not.toContain(tenantA.companyId);
      expect((res.body as Body).data).toBeUndefined();
    });

    it.each([
      ['activities', () => `/activities?contactId=${ids.cA}`],
      ['deals', () => `/deals?contactId=${ids.cA}`],
      ['tasks', () => `/tasks?contactId=${ids.cA}`],
      ['calendar events', () => calendarQuery(ids.cA)],
    ])(
      'returns an EMPTY %s page - rows and total - for a foreign contact, even though company B has rows that reference it',
      async (_n, url) => {
        const res = await writerB.agent.get(url());

        expect(res.status).toBe(200);
        expect(rowsOf(res)).toEqual([]);
        const total = (res.body as Body).meta?.total;
        if (total !== undefined) {
          expect(total).toBe(0);
        }
      },
    );

    it("shows company B its own contact's rows from every source and nothing of company A", async () => {
      const activities = await writerB.agent.get(
        `/activities?contactId=${ids.cB}`,
      );
      const deals = await writerB.agent.get(`/deals?contactId=${ids.cB}`);
      const tasks = await writerB.agent.get(`/tasks?contactId=${ids.cB}`);
      const events = await writerB.agent.get(calendarQuery(ids.cB));

      expect(idsOfRows(activities)).toEqual([ids.activityB]);
      expect(idsOfRows(deals)).toEqual([ids.dealB]);
      expect(idsOfRows(tasks)).toEqual([ids.taskB]);
      expect(idsOfRows(events)).toEqual([ids.eventB]);

      for (const res of [activities, deals, tasks, events]) {
        expect(JSON.stringify(res.body)).not.toContain(tenantA.companyId);
      }
    });
  });

  describe('company B writing with company-A ids (404, database untouched)', () => {
    it('rejects PATCH /contacts/:id (notes) and leaves company A notes unchanged', async () => {
      const before = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: ids.cA },
      });

      const res = await patch(writerB, `/contacts/${ids.cA}`, {
        notes: 'overwritten by company B',
      });

      expect(res.status).toBe(404);
      const after = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: ids.cA },
      });
      expect(after.notes).toBe(before.notes);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('rejects an activity that references a foreign contact (create and update)', async () => {
      const created = await post(writerB, '/activities', {
        type: 'NOTE',
        title: 'B writes on a company-A contact',
        contactId: ids.cA,
      });
      expect(created.status).toBe(404);
      expect(
        await harness.prisma.activity.count({
          where: { title: 'B writes on a company-A contact' },
        }),
      ).toBe(0);

      const updated = await patch(writerB, `/activities/${ids.activityB}`, {
        contactId: ids.cA,
      });
      expect(updated.status).toBe(404);
      const row = await harness.prisma.activity.findUniqueOrThrow({
        where: { id: ids.activityB },
      });
      expect(row.contactId).toBe(ids.cB);
    });

    it("rejects update and delete of another company's activity", async () => {
      const updated = await patch(writerB, `/activities/${ids.activityA}`, {
        title: 'hijacked',
      });
      const deleted = await del(writerB, `/activities/${ids.activityA}`);

      expect(updated.status).toBe(404);
      expect(deleted.status).toBe(404);
      const row = await harness.prisma.activity.findUniqueOrThrow({
        where: { id: ids.activityA },
      });
      expect(row.title).toBe('Activity activityA');
      expect(row.deletedAt).toBeNull();
    });

    it('rejects a deal, task or calendar event created for a foreign contact', async () => {
      const deal = await post(writerB, '/deals', {
        title: 'B deal for company-A contact',
        contactId: ids.cA,
      });
      const task = await post(writerB, '/tasks', {
        title: 'B task for company-A contact',
        contactId: ids.cA,
      });
      const event = await post(writerB, '/calendar', {
        title: 'B event for company-A contact',
        startAt: new Date(BASE_TIME + 3 * HOUR).toISOString(),
        endAt: new Date(BASE_TIME + 4 * HOUR).toISOString(),
        contactId: ids.cA,
      });

      expect([deal.status, task.status, event.status]).toEqual([404, 404, 404]);
      expect(
        await harness.prisma.deal.count({
          where: { title: 'B deal for company-A contact' },
        }),
      ).toBe(0);
      expect(
        await harness.prisma.task.count({
          where: { title: 'B task for company-A contact' },
        }),
      ).toBe(0);
      expect(
        await harness.prisma.calendarEvent.count({
          where: { title: 'B event for company-A contact' },
        }),
      ).toBe(0);
    });

    it('rejects re-pointing an existing company-B deal, task or event at a foreign contact', async () => {
      const deal = await patch(writerB, `/deals/${ids.dealB}`, {
        contactId: ids.cA,
      });
      const task = await patch(writerB, `/tasks/${ids.taskB}`, {
        contactId: ids.cA,
      });
      const event = await patch(writerB, `/calendar/${ids.eventB}`, {
        contactId: ids.cA,
      });

      expect([deal.status, task.status, event.status]).toEqual([404, 404, 404]);
      const [dealRow, taskRow, eventRow] = await Promise.all([
        harness.prisma.deal.findUniqueOrThrow({ where: { id: ids.dealB } }),
        harness.prisma.task.findUniqueOrThrow({ where: { id: ids.taskB } }),
        harness.prisma.calendarEvent.findUniqueOrThrow({
          where: { id: ids.eventB },
        }),
      ]);
      expect(dealRow.contactId).toBe(ids.cB);
      expect(taskRow.contactId).toBe(ids.cB);
      expect(eventRow.contactId).toBe(ids.cB);
    });
  });

  describe('permissions are enforced by the server, not by the UI', () => {
    it('refuses PATCH /contacts/:id (notes) to a user without contact:update', async () => {
      const before = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: ids.cA },
      });

      const res = await patch(readOnlyA, `/contacts/${ids.cA}`, {
        notes: 'written by a read-only user',
      });

      expect(res.status).toBe(403);
      expect((res.body as Body).message).toBe(FORBIDDEN_MESSAGE);
      const after = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: ids.cA },
      });
      expect(after.notes).toBe(before.notes);
    });

    it('refuses to create or delete an activity for a user without those permissions', async () => {
      const created = await post(readOnlyA, '/activities', {
        type: 'NOTE',
        title: 'written by a read-only user',
        contactId: ids.cA,
      });
      const deleted = await del(readOnlyA, `/activities/${ids.activityA}`);

      expect(created.status).toBe(403);
      expect(deleted.status).toBe(403);
      expect(
        await harness.prisma.activity.count({
          where: { title: 'written by a read-only user' },
        }),
      ).toBe(0);
      const row = await harness.prisma.activity.findUniqueOrThrow({
        where: { id: ids.activityA },
      });
      expect(row.deletedAt).toBeNull();
    });

    it('still lets the read-only user read the timeline of its own company (read is allowed)', async () => {
      const res = await readOnlyA.agent.get(`/activities?contactId=${ids.cA}`);

      expect(res.status).toBe(200);
      expect(idsOfRows(res)).toEqual([ids.activityA]);
    });
  });
});
