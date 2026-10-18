/**
 * Activities - contact timeline (integration).
 *
 * Proves, against the real application + the real PostgreSQL test database
 * (`orbitcrm_test` only), that GET /activities?contactId=<id> returns the
 * contact's complete timeline and nothing else:
 *   - manual activities (Activity.contactId);
 *   - lifecycle events of the contact's deals / tasks / calendar events,
 *     which only carry dealId / taskId / calendarEventId (no contactId) -
 *     i.e. exactly the rows written before this feature existed;
 *   - every row once (an activity reachable through two paths is not
 *     duplicated); soft-deleted activities are excluded;
 *   - nothing of another company, even when rows or ids are inconsistent
 *     (the foreign keys are single-column, so the database alone cannot
 *     prevent a deal of company B pointing at a contact of company A);
 *   - pagination, sorting, `type` and `search` still work on top of it;
 *   - the endpoint still enforces activity:read and authentication.
 *
 * Authentication is the application's real flow (POST /auth/login). Tenant
 * users are non-owners without a role (read-only by decision D2), so no
 * owner bypass is involved. The RBAC case uses a role with no permissions.
 *
 * Fixtures are created through the harness-owned Prisma client. The harness
 * ledger does not know about deals / tasks / calendar events / activities, so
 * this spec keeps its own ledger of those ids and deletes them (children
 * first, scoped by id AND by the ledger's companies) before
 * `harness.cleanup()` removes users, contacts, roles and companies - the
 * users are referenced with onDelete: Restrict by these rows.
 *
 * Needs the PostgreSQL test database (`orbitcrm_test`, migrated) and the Prisma
 * engine; it cannot run without them. Run it with:
 *   npm run db:test:migrate && npm run test:int
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
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service';
import { AppModule } from '../../../src/modules/app/app.module';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const BCRYPT_ROUNDS = 10; // same cost PasswordService uses
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';
const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0);
const MINUTE = 60 * 1000;

interface ActivityBody {
  id: string;
  companyId: string;
  type: string;
  title: string;
  contactId: string | null;
  dealId: string | null;
  taskId: string | null;
  calendarEventId: string | null;
  occurredAt: string;
}

interface ListBody {
  success: boolean;
  statusCode: number;
  data: ActivityBody[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface ErrorBody {
  success: boolean;
  statusCode: number;
  message: string;
}

interface LoginBody {
  success: boolean;
  user: { id: string; email: string; isOwner: boolean };
}

interface Tenant {
  companyId: string;
  userId: string;
  email: string;
}

type Agent = ReturnType<typeof request.agent>;

describe('Activities contact timeline (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let password: string;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let agentA: Agent;
  let agentB: Agent;
  let agentNoPermission: Agent;

  /** Everything this spec creates beyond the harness ledger. */
  const ledger = {
    activityIds: [] as string[],
    calendarEventIds: [] as string[],
    taskIds: [] as string[],
    dealIds: [] as string[],
  };

  /** Fixture ids by name, e.g. ids.dealEventNoContact. */
  const ids: Record<string, string> = {};

  let offset = 0;
  const nextOccurredAt = (): Date =>
    new Date(BASE_TIME + (offset += 1) * MINUTE);
  /** Stored so the expected sort order can be derived, never hard-coded. */
  const occurredAtOf: Record<string, number> = {};

  async function createTenant(
    label: 'a' | 'b',
    passwordHash: string,
  ): Promise<Tenant> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(`timeline-${label}`) },
      select: { id: true },
    });
    harness.registerCompany(company.id);

    const email = harness.uniqueEmail(`timeline-${label}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Timeline',
        lastName: label.toUpperCase(),
        email,
        passwordHash,
        isEmailVerified: true,
        isActive: true,
        isOwner: false,
        roleId: null,
        companyId: company.id,
      },
      select: { id: true },
    });
    harness.registerUser(user.id);

    return { companyId: company.id, userId: user.id, email };
  }

  async function createContact(tenant: Tenant, key: string): Promise<void> {
    const contact = await harness.prisma.contact.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        firstName: `Timeline${key}`,
        lastName: `Contact-${harness.runId}`,
      },
      select: { id: true },
    });
    harness.registerContact(contact.id);
    ids[key] = contact.id;
  }

  async function createDeal(
    tenant: Tenant,
    key: string,
    data: { contactId?: string; deletedAt?: Date } = {},
  ): Promise<void> {
    const deal = await harness.prisma.deal.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        title: `Deal ${key}`,
        contactId: data.contactId ?? null,
        deletedAt: data.deletedAt ?? null,
      },
      select: { id: true },
    });
    ledger.dealIds.push(deal.id);
    ids[key] = deal.id;
  }

  async function createTask(
    tenant: Tenant,
    key: string,
    data: { contactId?: string } = {},
  ): Promise<void> {
    const task = await harness.prisma.task.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        title: `Task ${key}`,
        contactId: data.contactId ?? null,
      },
      select: { id: true },
    });
    ledger.taskIds.push(task.id);
    ids[key] = task.id;
  }

  async function createCalendarEvent(
    tenant: Tenant,
    key: string,
    data: { contactId?: string } = {},
  ): Promise<void> {
    const event = await harness.prisma.calendarEvent.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        title: `Event ${key}`,
        startAt: new Date(BASE_TIME),
        endAt: new Date(BASE_TIME + 60 * MINUTE),
        contactId: data.contactId ?? null,
      },
      select: { id: true },
    });
    ledger.calendarEventIds.push(event.id);
    ids[key] = event.id;
  }

  async function createActivity(
    tenant: Tenant,
    key: string,
    data: {
      companyId?: string;
      type?: string;
      title?: string;
      contactId?: string;
      dealId?: string;
      taskId?: string;
      calendarEventId?: string;
      deletedAt?: Date;
    } = {},
  ): Promise<void> {
    const occurredAt = nextOccurredAt();
    const activity = await harness.prisma.activity.create({
      data: {
        // Defaults to the creator's company; overridden only to build the
        // deliberately inconsistent cross-tenant rows.
        companyId: data.companyId ?? tenant.companyId,
        createdById: tenant.userId,
        type: data.type ?? 'SYSTEM',
        title: data.title ?? `Activity ${key}`,
        occurredAt,
        contactId: data.contactId ?? null,
        dealId: data.dealId ?? null,
        taskId: data.taskId ?? null,
        calendarEventId: data.calendarEventId ?? null,
        deletedAt: data.deletedAt ?? null,
      },
      select: { id: true },
    });
    ledger.activityIds.push(activity.id);
    ids[key] = activity.id;
    occurredAtOf[key] = occurredAt.getTime();
  }

  async function loginAs(email: string, userId: string): Promise<Agent> {
    const agent = request.agent(httpServer);
    const res = await agent.post('/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    const body = res.body as LoginBody;
    expect(body.user.id).toBe(userId);
    expect(body.user.isOwner).toBe(false);

    return agent;
  }

  const timeline = (agent: Agent, contactId: string, query = '') =>
    agent.get(`/activities?contactId=${contactId}${query}`);

  const idsOf = (body: ListBody): string[] => body.data.map((a) => a.id);
  const keysOf = (body: ListBody): string[] => {
    const byId = new Map(Object.entries(ids).map(([key, id]) => [id, key]));
    return body.data.map((a) => byId.get(a.id) ?? `UNKNOWN(${a.id})`);
  };

  /** Everything that must be on contact c1's timeline, nothing more. */
  const C1_EXPECTED = [
    'manualC1',
    'dealEventD1',
    'dealEventD1Second',
    'dealEventDeletedDeal',
    'taskEventT1',
    'calendarEventE1',
    'doublePathD1',
  ];

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();

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

    const rows = await app.get(PrismaService).$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(rows[0]?.current_database).toBe('orbitcrm_test');

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
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    tenantA = await createTenant('a', passwordHash);
    tenantB = await createTenant('b', passwordHash);

    // ---- Company A: contacts -------------------------------------------
    await createContact(tenantA, 'c1');
    await createContact(tenantA, 'c2');
    await createContact(tenantA, 'cEmpty'); // no related data at all
    // ---- Company B: contact --------------------------------------------
    await createContact(tenantB, 'cB');

    // ---- Company A: sources --------------------------------------------
    await createDeal(tenantA, 'D1', { contactId: ids.c1 });
    await createDeal(tenantA, 'D2', { contactId: ids.c2 });
    await createDeal(tenantA, 'DNone'); // belongs to no contact
    await createDeal(tenantA, 'DDeleted', {
      contactId: ids.c1,
      deletedAt: new Date(BASE_TIME),
    });
    await createTask(tenantA, 'T1', { contactId: ids.c1 });
    await createTask(tenantA, 'T2', { contactId: ids.c2 });
    await createCalendarEvent(tenantA, 'E1', { contactId: ids.c1 });
    await createCalendarEvent(tenantA, 'E2', { contactId: ids.c2 });

    // ---- Company B: sources --------------------------------------------
    await createDeal(tenantB, 'DB', { contactId: ids.cB });
    // INCONSISTENT on purpose: a company-B deal pointing at a company-A
    // contact. Single-column FKs allow it; the services never create it.
    await createDeal(tenantB, 'DBPointsAtC1', { contactId: ids.c1 });

    // ---- Company A: activities (oldest -> newest by creation order) ----
    // Written the way the lifecycle code writes them: source id only, no
    // contactId (= every row that predates this feature).
    await createActivity(tenantA, 'dealEventD1', {
      dealId: ids.D1,
      title: 'Deal created: D1',
    });
    await createActivity(tenantA, 'dealEventD1Second', {
      dealId: ids.D1,
      type: 'STATUS_CHANGE',
      title: 'Deal stage changed: new -> proposal',
    });
    await createActivity(tenantA, 'dealEventDeletedDeal', {
      dealId: ids.DDeleted,
      title: 'Deal deleted: DDeleted',
    });
    await createActivity(tenantA, 'taskEventT1', {
      taskId: ids.T1,
      type: 'STATUS_CHANGE',
      title: 'Task completed: T1',
    });
    await createActivity(tenantA, 'calendarEventE1', {
      calendarEventId: ids.E1,
      title: 'Event renewal meeting rescheduled',
    });
    // Manual activity logged straight on the contact.
    await createActivity(tenantA, 'manualC1', {
      type: 'NOTE',
      title: 'Called about the renewal',
      contactId: ids.c1,
    });
    // Reachable through TWO paths (own contactId AND its deal's contact).
    await createActivity(tenantA, 'doublePathD1', {
      contactId: ids.c1,
      dealId: ids.D1,
      title: 'Reachable through two paths',
    });
    // Must NOT appear on c1's timeline:
    await createActivity(tenantA, 'softDeletedManualC1', {
      type: 'NOTE',
      contactId: ids.c1,
      deletedAt: new Date(BASE_TIME),
    });
    await createActivity(tenantA, 'dealEventD2', { dealId: ids.D2 });
    await createActivity(tenantA, 'dealEventDNone', { dealId: ids.DNone });
    await createActivity(tenantA, 'taskEventT2', { taskId: ids.T2 });
    await createActivity(tenantA, 'calendarEventE2', {
      calendarEventId: ids.E2,
    });
    await createActivity(tenantA, 'manualC2', {
      type: 'NOTE',
      contactId: ids.c2,
    });
    await createActivity(tenantA, 'noSourceNoContact', { type: 'NOTE' });
    // Company-A activity pointing at a company-B deal whose contact is c1.
    await createActivity(tenantA, 'pointsAtForeignDeal', {
      dealId: ids.DBPointsAtC1,
    });

    // ---- Company B: activities -----------------------------------------
    await createActivity(tenantB, 'dealEventDB', { dealId: ids.DB });
    await createActivity(tenantB, 'manualCB', {
      type: 'NOTE',
      contactId: ids.cB,
    });
    // Company-B activities that reference company-A data.
    await createActivity(tenantB, 'bPointsAtContactC1', {
      contactId: ids.c1,
    });
    await createActivity(tenantB, 'bPointsAtDealD1', { dealId: ids.D1 });
    await createActivity(tenantB, 'bDealEventOfDBPointsAtC1', {
      dealId: ids.DBPointsAtC1,
    });

    // A role with no permissions, to prove activity:read is still enforced.
    const emptyRole = await harness.prisma.role.create({
      data: {
        companyId: tenantA.companyId,
        name: harness.uniqueName('timeline-empty-role'),
      },
      select: { id: true },
    });
    harness.registerRole(emptyRole.id);

    // Keep the label short: the address is "orbit-it-<uuid>-<label>@…" and the
    // login DTO's @IsEmail() rejects a local part longer than 64 characters
    // (a 68-character label made every login in beforeAll fail with 400).
    const noPermEmail = harness.uniqueEmail('timeline-noperm');
    const noPermUser = await harness.prisma.user.create({
      data: {
        firstName: 'Timeline',
        lastName: 'NoPermission',
        email: noPermEmail,
        passwordHash,
        isEmailVerified: true,
        isActive: true,
        isOwner: false,
        roleId: emptyRole.id,
        companyId: tenantA.companyId,
      },
      select: { id: true },
    });
    harness.registerUser(noPermUser.id);

    // Three logins in total (POST /auth/login is throttled to 5 per minute).
    agentA = await loginAs(tenantA.email, tenantA.userId);
    agentB = await loginAs(tenantB.email, tenantB.userId);
    agentNoPermission = await loginAs(noPermEmail, noPermUser.id);
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
        const ids2 = harness.createdIds();
        const companyIds = ids2.createdCompanyIds;

        // Children first; every delete is scoped by id AND by a company this
        // run created. An empty id list never reaches Prisma.
        if (ledger.activityIds.length > 0 && companyIds.length > 0) {
          await harness.prisma.activity.deleteMany({
            where: {
              id: { in: ledger.activityIds },
              companyId: { in: companyIds },
            },
          });
        }
        if (ledger.calendarEventIds.length > 0 && companyIds.length > 0) {
          await harness.prisma.calendarEvent.deleteMany({
            where: {
              id: { in: ledger.calendarEventIds },
              companyId: { in: companyIds },
            },
          });
        }
        if (ledger.taskIds.length > 0 && companyIds.length > 0) {
          await harness.prisma.task.deleteMany({
            where: {
              id: { in: ledger.taskIds },
              companyId: { in: companyIds },
            },
          });
        }
        if (ledger.dealIds.length > 0 && companyIds.length > 0) {
          await harness.prisma.deal.deleteMany({
            where: {
              id: { in: ledger.dealIds },
              companyId: { in: companyIds },
            },
          });
        }

        const report = await harness.cleanup();
        console.log(
          `[activities-contact-timeline] cleanup deleted: ${JSON.stringify(report.deleted)}`,
        );

        const [companies, users, contacts, activities, deals] =
          await Promise.all([
            harness.prisma.company.count({ where: { id: { in: companyIds } } }),
            harness.prisma.user.count({
              where: { id: { in: ids2.createdUserIds } },
            }),
            harness.prisma.contact.count({
              where: { id: { in: ids2.createdContactIds } },
            }),
            harness.prisma.activity.count({
              where: { id: { in: ledger.activityIds } },
            }),
            harness.prisma.deal.count({
              where: { id: { in: ledger.dealIds } },
            }),
          ]);

        if (companies + users + contacts + activities + deals > 0) {
          throw new Error(
            `Cleanup left records behind: companies=${companies} users=${users} contacts=${contacts} activities=${activities} deals=${deals}`,
          );
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

  describe('completeness and correctness', () => {
    it("returns the manual activities AND the lifecycle events of the contact's deals, tasks and calendar events, and nothing else", async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect([...keysOf(body)].sort()).toEqual([...C1_EXPECTED].sort());
      expect(body.meta.total).toBe(C1_EXPECTED.length);
    });

    it('resolves legacy lifecycle events that carry no contactId, through their source entity', async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      const dealEvent = body.data.find((a) => a.id === ids.dealEventD1);
      const taskEvent = body.data.find((a) => a.id === ids.taskEventT1);
      const calendarEvent = body.data.find((a) => a.id === ids.calendarEventE1);

      for (const row of [dealEvent, taskEvent, calendarEvent]) {
        expect(row).toBeDefined();
        expect(row?.contactId).toBeNull();
      }
      expect(dealEvent?.dealId).toBe(ids.D1);
      expect(taskEvent?.taskId).toBe(ids.T1);
      expect(calendarEvent?.calendarEventId).toBe(ids.E1);
    });

    it('returns an activity reachable through two paths exactly once', async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      expect(idsOf(body).filter((id) => id === ids.doublePathD1)).toHaveLength(
        1,
      );
      expect(new Set(idsOf(body)).size).toBe(body.data.length);
    });

    it('excludes soft-deleted activities, but keeps the events of a soft-deleted source (its "deleted" event is history)', async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      expect(idsOf(body)).not.toContain(ids.softDeletedManualC1);
      expect(idsOf(body)).toContain(ids.dealEventDeletedDeal);
    });

    it("does not leak another contact's, an unowned deal's or an unlinked activity into the timeline", async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      for (const key of [
        'dealEventD2',
        'dealEventDNone',
        'taskEventT2',
        'calendarEventE2',
        'manualC2',
        'noSourceNoContact',
      ]) {
        expect(idsOf(body)).not.toContain(ids[key]);
      }
    });

    it('gives the other contact only its own timeline', async () => {
      const res = await timeline(agentA, ids.c2);
      const body = res.body as ListBody;

      expect([...keysOf(body)].sort()).toEqual(
        ['dealEventD2', 'taskEventT2', 'calendarEventE2', 'manualC2'].sort(),
      );
    });

    it('returns an empty, well-formed page for a contact with no activities or related entities', async () => {
      const res = await timeline(agentA, ids.cEmpty);
      const body = res.body as ListBody;

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
      expect(body.meta.totalPages).toBe(0);
      expect(body.meta.hasNextPage).toBe(false);
    });

    it('still returns the global feed (no contactId) of the caller company only', async () => {
      const res = await agentA.get('/activities?limit=100');
      const body = res.body as ListBody;

      expect(res.status).toBe(200);
      expect(body.data.every((a) => a.companyId === tenantA.companyId)).toBe(
        true,
      );
      expect(idsOf(body)).not.toContain(ids.dealEventDB);
      expect(idsOf(body)).not.toContain(ids.bPointsAtContactC1);
    });
  });

  describe('tenant isolation', () => {
    it("never shows company-B rows on company A's timeline, even when they reference company-A ids", async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      for (const key of [
        'bPointsAtContactC1', // company-B activity whose contactId is c1
        'bPointsAtDealD1', // company-B activity whose dealId is D1
        'bDealEventOfDBPointsAtC1',
        'dealEventDB',
        'manualCB',
      ]) {
        expect(idsOf(body)).not.toContain(ids[key]);
      }
      expect(body.data.every((a) => a.companyId === tenantA.companyId)).toBe(
        true,
      );
    });

    it('does not follow a company-A activity into a company-B deal that points at a company-A contact', async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      expect(idsOf(body)).not.toContain(ids.pointsAtForeignDeal);
    });

    it('returns an empty page (not an error, not data) when company B asks for a company-A contact', async () => {
      const res = await timeline(agentB, ids.c1);
      const body = res.body as ListBody;

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(tenantA.companyId);
      expect(serialized).not.toContain(ids.D1);
    });

    it("shows company B only its own contact's timeline", async () => {
      const res = await timeline(agentB, ids.cB);
      const body = res.body as ListBody;

      expect([...keysOf(body)].sort()).toEqual(
        ['dealEventDB', 'manualCB'].sort(),
      );
      expect(body.data.every((a) => a.companyId === tenantB.companyId)).toBe(
        true,
      );
    });

    it('ignores a companyId smuggled in the query string (the tenant comes from the session)', async () => {
      const res = await agentA.get(
        `/activities?contactId=${ids.c1}&companyId=${tenantB.companyId}`,
      );

      // The global ValidationPipe rejects unknown query properties.
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(ids.dealEventDB);
    });
  });

  describe('pagination, sorting and filters on top of the timeline', () => {
    it('is ordered newest first by default and the order is deterministic', async () => {
      const res = await timeline(agentA, ids.c1);
      const body = res.body as ListBody;

      const expectedOrder = [...C1_EXPECTED].sort(
        (x, y) => occurredAtOf[y] - occurredAtOf[x],
      );
      expect(keysOf(body)).toEqual(expectedOrder);
    });

    it('supports ascending order', async () => {
      const res = await timeline(agentA, ids.c1, '&sortOrder=asc');
      const body = res.body as ListBody;

      const expectedOrder = [...C1_EXPECTED].sort(
        (x, y) => occurredAtOf[x] - occurredAtOf[y],
      );
      expect(keysOf(body)).toEqual(expectedOrder);
    });

    it('paginates without gaps or duplicates and reports consistent meta', async () => {
      const pages: ListBody[] = [];
      for (const page of [1, 2, 3]) {
        const res = await timeline(agentA, ids.c1, `&limit=3&page=${page}`);
        expect(res.status).toBe(200);
        pages.push(res.body as ListBody);
      }

      expect(pages.map((p) => p.data.length)).toEqual([3, 3, 1]);
      for (const p of pages) {
        expect(p.meta.total).toBe(C1_EXPECTED.length);
        expect(p.meta.totalPages).toBe(3);
      }
      expect(pages[0].meta.hasNextPage).toBe(true);
      expect(pages[2].meta.hasNextPage).toBe(false);

      const all = pages.flatMap((p) => keysOf(p));
      expect(new Set(all).size).toBe(all.length);
      expect([...all].sort()).toEqual([...C1_EXPECTED].sort());
    });

    it('filters by type inside the timeline', async () => {
      const res = await timeline(agentA, ids.c1, '&type=STATUS_CHANGE');
      const body = res.body as ListBody;

      expect([...keysOf(body)].sort()).toEqual(
        ['dealEventD1Second', 'taskEventT1'].sort(),
      );
    });

    it('applies search inside the timeline without widening it', async () => {
      const res = await timeline(agentA, ids.c1, '&search=renewal');
      const body = res.body as ListBody;

      // 'renewal' appears in a calendar lifecycle event and in a manual note
      // of c1; company-A rows of other contacts and all of company B stay out.
      expect([...keysOf(body)].sort()).toEqual(
        ['calendarEventE1', 'manualC1'].sort(),
      );
    });

    it('applies the date range inside the timeline', async () => {
      const from = new Date(occurredAtOf.manualC1).toISOString();
      const res = await timeline(
        agentA,
        ids.c1,
        `&dateFrom=${encodeURIComponent(from)}`,
      );
      const body = res.body as ListBody;

      expect([...keysOf(body)].sort()).toEqual(
        ['manualC1', 'doublePathD1'].sort(),
      );
    });
  });

  describe('authentication and RBAC', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(httpServer).get(
        `/activities?contactId=${ids.c1}`,
      );

      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(ids.dealEventD1);
    });

    it('rejects, with 403 and no data, a user whose role lacks activity:read', async () => {
      const res = await timeline(agentNoPermission, ids.c1);
      const body = res.body as ErrorBody;

      expect(res.status).toBe(403);
      expect(body.message).toBe(FORBIDDEN_MESSAGE);
      expect(JSON.stringify(body)).not.toContain(ids.dealEventD1);
    });
  });
});
