/**
 * Reports MVP (integration) — R1 Pipeline Snapshot, R3 Leads Overview,
 * R4 Tasks Overview.
 *
 * Runs against the real application and the real PostgreSQL test database
 * (`orbitcrm_test` only), so it exercises the actual SQL: tenant scoping,
 * soft-delete filtering, time-zone/DST day boundaries computed by
 * PostgreSQL, NUMERIC precision and the distinct-lead EXISTS.
 *
 * Fixtures
 * - Company A holds the data under test; Company B holds look-alike rows
 *   that must NEVER appear in A's numbers (and vice versa).
 * - Rows are created straight through Prisma with explicit createdAt /
 *   dueDate instants chosen to sit exactly on, and one millisecond either
 *   side of, the Africa/Cairo and America/New_York day boundaries.
 * - Every Company / Role / User is registered in the harness ledger. Deals,
 *   Leads and Tasks are not tracked by the ledger, so they are removed by
 *   companyId (only the two companies this run created) just before
 *   harness.cleanup(), the same way the Notifications fixtures do.
 * - Users authenticate with access tokens signed by the application's own
 *   JwtService. The global Permission table is read only.
 */
import type { Server } from 'http';

import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../../../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../../../src/common/interceptors/response.interceptor';
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service';
import { AppModule } from '../../../src/modules/app/app.module';
import type {
  LeadsOverviewReport,
  PipelineSnapshotReport,
  TasksOverviewReport,
} from '../../../src/modules/report/interfaces/report.interfaces';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const ACCESS_COOKIE = 'orbit_access_token';
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';

const CAIRO_OCT_2026 = {
  from: '2026-10-01',
  to: '2026-10-31',
  timezone: 'Africa/Cairo',
};

interface Actor {
  id: string;
  email: string;
  companyId: string;
}

type Body<T = unknown> = { data: T; message?: string };

describe('Reports (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let jwt: JwtService;
  let prisma: PrismaService;

  let companyA: string;
  let companyB: string;
  let fullReader: Actor; // A: deal+lead+task read
  let noDealReader: Actor; // A: lead+task read only
  let roleLess: Actor; // A: roleId null (read-only)
  let readerB: Actor; // B: deal+lead+task read

  const permissionIds = new Map<string, string>();
  let sequence = 0;

  const at = (iso: string) => new Date(iso);

  async function createCompany(label: string): Promise<string> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(label) },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    return company.id;
  }

  async function createRole(
    companyId: string,
    label: string,
    keys: string[],
  ): Promise<string> {
    sequence += 1;
    const role = await harness.prisma.role.create({
      data: {
        companyId,
        name: harness.uniqueName(`${label}-${sequence}`),
        rolePermissions: {
          createMany: {
            data: keys.map((key) => ({
              permissionId: permissionIds.get(key) as string,
            })),
          },
        },
      },
      select: { id: true },
    });
    harness.registerRole(role.id);
    return role.id;
  }

  async function createUser(
    companyId: string,
    label: string,
    roleId: string | null,
    passwordHash: string,
  ): Promise<Actor> {
    sequence += 1;
    const email = harness.uniqueEmail(`${label}-${sequence}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Report',
        lastName: label,
        email,
        passwordHash,
        isEmailVerified: true,
        isActive: true,
        isOwner: false,
        companyId,
        roleId,
      },
      select: { id: true },
    });
    harness.registerUser(user.id);
    return { id: user.id, email, companyId };
  }

  const get = (actor: Actor, path: string, query: Record<string, string>) =>
    request(httpServer)
      .get(path)
      .query(query)
      .set('Cookie', [
        `${ACCESS_COOKIE}=${jwt.sign({
          sub: actor.id,
          companyId: actor.companyId,
          email: actor.email,
          isOwner: false,
        })}`,
      ]);

  async function seedCompanyA(creator: Actor) {
    const c = companyA;
    const by = creator.id;

    // ---- Deals ---------------------------------------------------------
    const deal = (
      stage: string,
      amount: string,
      createdAt: string,
      extra: Record<string, unknown> = {},
    ) =>
      harness.prisma.deal.create({
        data: {
          companyId: c,
          createdById: by,
          title: harness.uniqueName(`deal-${stage}`),
          stage,
          amount,
          createdAt: at(createdAt),
          ...extra,
        },
        select: { id: true },
      });

    await deal('new', '1000.10', '2026-10-05T10:00:00.000Z');
    await deal('proposal', '2000.20', '2026-10-06T10:00:00.000Z'); // linked to L1 below
    await deal('negotiation', '0.30', '2026-10-07T10:00:00.000Z');
    await deal('closed_won', '5000.00', '2026-10-08T10:00:00.000Z');
    await deal('closed_lost', '250.55', '2026-10-09T10:00:00.000Z');
    await deal('new', '999.00', '2026-10-10T10:00:00.000Z', {
      deletedAt: at('2026-10-11T00:00:00.000Z'),
    });
    await deal('weird_stage', '77.00', '2026-10-12T10:00:00.000Z');
    await deal('qualification', '123.45', '2026-01-01T10:00:00.000Z'); // open, created OUTSIDE the range
    await deal('new', '9999999000.01', '2026-10-13T10:00:00.000Z'); // near the NUMERIC(12,2) ceiling

    // ---- Leads ---------------------------------------------------------
    const lead = (
      status: string,
      source: string | null,
      createdAt: string,
      extra: Record<string, unknown> = {},
    ) =>
      harness.prisma.lead.create({
        data: {
          companyId: c,
          createdById: by,
          firstName: 'Lead',
          lastName: harness.uniqueName(`lead-${status}`),
          status,
          source,
          createdAt: at(createdAt),
          ...extra,
        },
        select: { id: true },
      });

    const l1 = await lead('new', 'Facebook', '2026-10-02T10:00:00.000Z');
    await lead('qualified', 'facebook ', '2026-10-03T10:00:00.000Z');
    const l3 = await lead('lost', null, '2026-10-04T10:00:00.000Z');
    const l4 = await lead('new', '   ', '2026-10-05T10:00:00.000Z');
    await lead('contacted', 'other', '2026-10-06T10:00:00.000Z');
    // Outside the range by 1 ms (Cairo midnight is 21:00Z on Sep 30) and a deleted one:
    await lead('new', 'Facebook', '2026-09-30T20:59:59.999Z');
    await lead('new', 'Facebook', '2026-10-07T10:00:00.000Z', {
      deletedAt: at('2026-10-08T00:00:00.000Z'),
    });

    // L1 has TWO linked deals (must count once); L4 has one; L3's only deal
    // is soft-deleted (not linked).
    const linked = (leadId: string, extra: Record<string, unknown> = {}) =>
      harness.prisma.deal.create({
        data: {
          companyId: c,
          createdById: by,
          title: harness.uniqueName('linked'),
          stage: 'closed_lost', // closed, so the pipeline numbers above stay put
          amount: '0.00',
          createdAt: at('2026-01-02T00:00:00.000Z'),
          leadId,
          ...extra,
        },
        select: { id: true },
      });
    await linked(l1.id);
    await linked(l1.id);
    await linked(l4.id);
    await linked(l3.id, { deletedAt: at('2026-10-20T00:00:00.000Z') });

    // ---- Tasks ---------------------------------------------------------
    const task = (
      status: string,
      dueDate: string | null,
      extra: Record<string, unknown> = {},
    ) =>
      harness.prisma.task.create({
        data: {
          companyId: c,
          createdById: by,
          title: harness.uniqueName(`task-${status}`),
          status,
          dueDate: dueDate ? at(dueDate) : null,
          ...extra,
        },
        select: { id: true },
      });

    await task('completed', '2026-09-30T21:00:00.000Z'); // first ms of Oct 1 Cairo: IN
    await task('completed', '2026-09-30T20:59:59.999Z'); // 1 ms before: OUT
    await task('cancelled', '2026-10-31T21:59:59.999Z'); // last ms of Oct 31 Cairo (UTC+2): IN
    await task('completed', '2026-10-31T22:00:00.000Z'); // first ms of Nov 1: OUT
    await task('todo', '2026-10-15T10:00:00.000Z');
    await task('in_progress', '2026-10-16T10:00:00.000Z');
    await task('completed', '2026-10-17T10:00:00.000Z');
    await task('todo', '2026-10-18T10:00:00.000Z', {
      deletedAt: at('2026-10-19T00:00:00.000Z'),
    }); // deleted: OUT
    await task('todo', null); // no due date
    await task('completed', null); // no due date

    // ---- DST (America/New_York spring forward, 2026-03-08, a 23h day) ---
    await task('todo', '2026-03-08T04:59:59.999Z'); // 23:59:59.999 EST on Mar 7: OUT of Mar 8
    await task('todo', '2026-03-08T05:00:00.000Z'); // 00:00 EST Mar 8: IN
    await task('todo', '2026-03-09T03:59:59.999Z'); // 23:59:59.999 EDT Mar 8: IN
    await task('todo', '2026-03-09T04:00:00.000Z'); // 00:00 EDT Mar 9: OUT
  }

  async function seedCompanyB(creator: Actor) {
    const c = companyB;
    const by = creator.id;
    const bLead = await harness.prisma.lead.create({
      data: {
        companyId: c,
        createdById: by,
        firstName: 'B',
        lastName: harness.uniqueName('b-lead'),
        status: 'new',
        source: 'Facebook',
        createdAt: at('2026-10-02T10:00:00.000Z'),
      },
      select: { id: true },
    });
    await harness.prisma.deal.create({
      data: {
        companyId: c,
        createdById: by,
        title: harness.uniqueName('b-deal'),
        stage: 'new',
        amount: '1000000.00',
        createdAt: at('2026-10-05T10:00:00.000Z'),
        leadId: bLead.id,
      },
    });
    await harness.prisma.task.create({
      data: {
        companyId: c,
        createdById: by,
        title: harness.uniqueName('b-task'),
        status: 'completed',
        dueDate: at('2026-10-15T10:00:00.000Z'),
      },
    });
  }

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
    jwt = app.get(JwtService, { strict: false });
    prisma = app.get(PrismaService);

    const rows = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(rows[0]?.current_database).toBe('orbitcrm_test');
    expect(process.env.NODE_ENV).toBe('test');

    const catalog = await harness.prisma.permission.findMany({
      select: { id: true, resource: true, action: true },
    });
    for (const p of catalog) {
      permissionIds.set(`${p.resource}:${p.action}`, p.id);
    }
    const needed = ['deal:read', 'lead:read', 'task:read'];
    const missing = needed.filter((key) => !permissionIds.has(key));
    if (missing.length > 0) {
      throw new Error(
        `The global Permission table in orbitcrm_test is missing: ${missing.join(', ')}.`,
      );
    }

    const passwordHash = await bcrypt.hash(`Orbit-It-${harness.runId}`, 10);

    companyA = await createCompany('reports-company-a');
    companyB = await createCompany('reports-company-b');

    const fullRole = await createRole(companyA, 'rep-full', needed);
    const noDealRole = await createRole(companyA, 'rep-nodeal', [
      'lead:read',
      'task:read',
    ]);
    const fullRoleB = await createRole(companyB, 'rep-full-b', needed);

    fullReader = await createUser(companyA, 'full', fullRole, passwordHash);
    noDealReader = await createUser(
      companyA,
      'nodeal',
      noDealRole,
      passwordHash,
    );
    roleLess = await createUser(companyA, 'roleless', null, passwordHash);
    readerB = await createUser(companyB, 'full-b', fullRoleB, passwordHash);

    await seedCompanyA(fullReader);
    await seedCompanyB(readerB);
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
        const ids = harness.createdIds();

        // Only the companies THIS run created: the ledger is the source.
        if (ids.createdCompanyIds.length > 0) {
          const where = { companyId: { in: ids.createdCompanyIds } };
          await harness.prisma.task.deleteMany({ where });
          await harness.prisma.deal.deleteMany({ where });
          await harness.prisma.lead.deleteMany({ where });
        }

        await harness.cleanup();

        const [companies, users, roles] = await Promise.all([
          harness.prisma.company.count({
            where: { id: { in: ids.createdCompanyIds } },
          }),
          harness.prisma.user.count({
            where: { id: { in: ids.createdUserIds } },
          }),
          harness.prisma.role.count({
            where: { id: { in: ids.createdRoleIds } },
          }),
        ]);
        if (companies + users + roles > 0) {
          throw new Error(
            `Cleanup left records behind: companies=${companies} users=${users} roles=${roles}`,
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

  // ----------------------------------------------------------------- R1

  describe('R1 — GET /reports/pipeline-snapshot', () => {
    it('reports the CURRENT open pipeline with exact decimals, excluding closed, deleted, unknown-stage and other-company deals', async () => {
      const res = await get(
        fullReader,
        '/reports/pipeline-snapshot',
        CAIRO_OCT_2026,
      );

      expect(res.status).toBe(200);
      const { snapshot } = (res.body as Body<PipelineSnapshotReport>).data;

      // open = new 1000.10 + new 9999999000.01 + proposal 2000.20 + negotiation 0.30
      //        + qualification 123.45 (created outside the range, still open)
      expect(snapshot.openDealCount).toBe(5);
      expect(snapshot.openDealValue).toBe('10000002124.06');
      expect(snapshot.unrecognizedStageDealCount).toBe(1);

      const byStage = Object.fromEntries(
        snapshot.stages.map((s) => [s.stage, s]),
      );
      expect(snapshot.stages.map((s) => s.stage)).toEqual([
        'new',
        'qualification',
        'proposal',
        'negotiation',
      ]);
      expect(byStage.new).toMatchObject({
        dealCount: 2,
        totalValue: '10000000000.11',
      });
      expect(byStage.qualification).toMatchObject({
        dealCount: 1,
        totalValue: '123.45',
      });
      expect(byStage.proposal.totalValue).toBe('2000.20');
      expect(byStage.negotiation.totalValue).toBe('0.30');
      // No JS number ever carried money:
      expect(typeof snapshot.openDealValue).toBe('string');
    });

    it('keeps "created in range" separate from the snapshot (a different question)', async () => {
      const res = await get(
        fullReader,
        '/reports/pipeline-snapshot',
        CAIRO_OCT_2026,
      );
      const { createdInRange, snapshot } = (
        res.body as Body<PipelineSnapshotReport>
      ).data;

      // Created Oct 5..13 in A (not the Jan qualification deal, not the deleted one):
      // 1000.10 + 2000.20 + 0.30 + 5000.00 + 250.55 + 77.00 + 9999999000.01
      // + the 4 linked deals are created in January (0.00 each, out of range).
      expect(createdInRange.dealCount).toBe(7);
      expect(createdInRange.totalValue).toBe('10000007328.16');
      expect(snapshot.openDealCount).toBe(5);
      expect(snapshot.openDealCount).not.toBe(createdInRange.dealCount);
    });

    it("never includes another company's deals, and scopes by the caller's own company", async () => {
      const res = await get(
        readerB,
        '/reports/pipeline-snapshot',
        CAIRO_OCT_2026,
      );

      expect(res.status).toBe(200);
      const { snapshot, createdInRange } = (
        res.body as Body<PipelineSnapshotReport>
      ).data;
      expect(snapshot.openDealCount).toBe(1);
      expect(snapshot.openDealValue).toBe('1000000.00');
      expect(createdInRange.dealCount).toBe(1);
    });

    it('returns zeros and null shares for a company with no open deals', async () => {
      const empty = await createCompany('reports-empty');
      const role = await createRole(empty, 'rep-empty', ['deal:read']);
      const hash = await bcrypt.hash('x', 4);
      const actor = await createUser(empty, 'empty', role, hash);

      const res = await get(
        actor,
        '/reports/pipeline-snapshot',
        CAIRO_OCT_2026,
      );

      expect(res.status).toBe(200);
      const { snapshot } = (res.body as Body<PipelineSnapshotReport>).data;
      expect(snapshot.openDealCount).toBe(0);
      expect(snapshot.openDealValue).toBe('0.00');
      expect(snapshot.stages.every((s) => s.valueSharePercent === null)).toBe(
        true,
      );
    });

    it('is denied (403) without deal:read, and allowed for a role-less (read-only) user', async () => {
      const denied = await get(
        noDealReader,
        '/reports/pipeline-snapshot',
        CAIRO_OCT_2026,
      );
      expect(denied.status).toBe(403);
      expect((denied.body as Body).message).toBe(FORBIDDEN_MESSAGE);

      const allowed = await get(
        roleLess,
        '/reports/pipeline-snapshot',
        CAIRO_OCT_2026,
      );
      expect(allowed.status).toBe(200);
    });
  });

  // ----------------------------------------------------------------- R3

  describe('R3 — GET /reports/leads-overview', () => {
    it('counts leads created in the Cairo-day range only (1 ms either side), excluding deleted and other-company leads', async () => {
      const res = await get(
        fullReader,
        '/reports/leads-overview',
        CAIRO_OCT_2026,
      );

      expect(res.status).toBe(200);
      const data = (res.body as Body<LeadsOverviewReport>).data;
      expect(data.totalLeads).toBe(5);
      expect(data.range).toMatchObject({
        from: '2026-10-01',
        to: '2026-10-31',
        timezone: 'Africa/Cairo',
        // Cairo is UTC+3 on Oct 1 (DST until Oct 29) and UTC+2 on Nov 1.
        startUtc: '2026-09-30T21:00:00.000Z',
        endUtc: '2026-10-31T22:00:00.000Z',
      });
    });

    it('counts "leads with a linked deal" as DISTINCT leads, ignoring soft-deleted deals', async () => {
      const res = await get(
        fullReader,
        '/reports/leads-overview',
        CAIRO_OCT_2026,
      );
      const data = (res.body as Body<LeadsOverviewReport>).data;

      // L1 has two live deals (counts once), L4 one, L3's only deal is deleted.
      expect(data.leadsWithLinkedDeal).toEqual({
        count: 2,
        percentOfLeads: '40.00',
      });
      expect(data).not.toHaveProperty('conversionRate');
    });

    it("reports each lead's CURRENT status and groups sources case/whitespace-insensitively with null/blank kept apart", async () => {
      const res = await get(
        fullReader,
        '/reports/leads-overview',
        CAIRO_OCT_2026,
      );
      const data = (res.body as Body<LeadsOverviewReport>).data;

      expect(data.statusDistribution).toEqual([
        { status: 'new', count: 2 },
        { status: 'contacted', count: 1 },
        { status: 'qualified', count: 1 },
        { status: 'unqualified', count: 0 },
        { status: 'lost', count: 1 },
      ]);
      expect(data.sources).toEqual([
        { kind: 'source', value: 'facebook', count: 2 }, // "Facebook" + "facebook "
        { kind: 'source', value: 'other', count: 1 }, // a real source literally named "other"
        { kind: 'unspecified', count: 2 }, // null + blank
      ]);
      // The real "other" source is not the synthetic long-tail bucket.
      expect(data.sources.filter((s) => s.kind === 'other')).toHaveLength(0);
    });

    it("isolates tenants: company B's report contains only B's lead", async () => {
      const res = await get(readerB, '/reports/leads-overview', CAIRO_OCT_2026);

      const data = (res.body as Body<LeadsOverviewReport>).data;
      expect(data.totalLeads).toBe(1);
      expect(data.leadsWithLinkedDeal.count).toBe(1);
      expect(data.sources).toEqual([
        { kind: 'source', value: 'facebook', count: 1 },
      ]);
    });

    it('requires BOTH lead:read and deal:read', async () => {
      const denied = await get(
        noDealReader,
        '/reports/leads-overview',
        CAIRO_OCT_2026,
      );
      expect(denied.status).toBe(403);

      const allowed = await get(
        roleLess,
        '/reports/leads-overview',
        CAIRO_OCT_2026,
      );
      expect(allowed.status).toBe(200);
    });

    it('returns an empty-but-valid report (null percentage) when no lead falls in the range', async () => {
      const res = await get(fullReader, '/reports/leads-overview', {
        from: '2025-01-01',
        to: '2025-01-31',
        timezone: 'UTC',
      });

      expect(res.status).toBe(200);
      const data = (res.body as Body<LeadsOverviewReport>).data;
      expect(data.totalLeads).toBe(0);
      expect(data.leadsWithLinkedDeal).toEqual({
        count: 0,
        percentOfLeads: null,
      });
      expect(data.sources).toEqual([]);
    });
  });

  // ----------------------------------------------------------------- R4

  describe('R4 — GET /reports/tasks-overview', () => {
    it('uses Cairo-day boundaries to the millisecond and excludes deleted, undated and other-company tasks', async () => {
      const res = await get(
        fullReader,
        '/reports/tasks-overview',
        CAIRO_OCT_2026,
      );

      expect(res.status).toBe(200);
      const data = (res.body as Body<TasksOverviewReport>).data;

      // IN: completed@Oct1 00:00 Cairo, cancelled@Oct31 23:59:59.999 Cairo,
      //     todo, in_progress, completed (mid-month)  => 5
      expect(data.totalDueInRange).toBe(5);
      expect(data.byStatus).toEqual({
        todo: 1,
        in_progress: 1,
        completed: 2,
        cancelled: 1,
        other: 0,
      });
    });

    it('computes completed / (eligible − cancelled) × 100 with cancelled removed exactly once', async () => {
      const res = await get(
        fullReader,
        '/reports/tasks-overview',
        CAIRO_OCT_2026,
      );
      const data = (res.body as Body<TasksOverviewReport>).data;

      // 2 / (5 - 1) = 50.00  (NOT 2/5 = 40.00, NOT 2/(5-2) = 66.67)
      expect(data.completionRatePercent).toBe('50.00');
    });

    it('reports tasks without a due date separately, never in the cohort', async () => {
      const res = await get(
        fullReader,
        '/reports/tasks-overview',
        CAIRO_OCT_2026,
      );
      const data = (res.body as Body<TasksOverviewReport>).data;

      expect(data.withoutDueDate).toEqual({ total: 2, open: 1 });
      expect(data.totalDueInRange).toBe(5); // unchanged by the 2 undated tasks
    });

    it('handles the spring-forward day in America/New_York (a 23-hour day)', async () => {
      const res = await get(fullReader, '/reports/tasks-overview', {
        from: '2026-03-08',
        to: '2026-03-08',
        timezone: 'America/New_York',
      });

      expect(res.status).toBe(200);
      const data = (res.body as Body<TasksOverviewReport>).data;
      expect(data.range.startUtc).toBe('2026-03-08T05:00:00.000Z');
      expect(data.range.endUtc).toBe('2026-03-09T04:00:00.000Z');
      expect(data.totalDueInRange).toBe(2);
      expect(data.completionRatePercent).toBe('0.00'); // 0 completed / 2
    });

    it('treats the same instants differently in UTC (proving the viewer zone matters)', async () => {
      const res = await get(fullReader, '/reports/tasks-overview', {
        from: '2026-03-08',
        to: '2026-03-08',
        timezone: 'UTC',
      });

      // UTC day Mar 8 = [Mar 8 00:00Z, Mar 9 00:00Z): catches the 04:59Z and 05:00Z ones, not 03:59Z Mar 9.
      expect((res.body as Body<TasksOverviewReport>).data.totalDueInRange).toBe(
        2,
      );
      expect((res.body as Body<TasksOverviewReport>).data.range.startUtc).toBe(
        '2026-03-08T00:00:00.000Z',
      );
    });

    it('handles the 25-hour fall-back day in Africa/Cairo (2026-10-29)', async () => {
      const res = await get(fullReader, '/reports/tasks-overview', {
        from: '2026-10-29',
        to: '2026-10-29',
        timezone: 'Africa/Cairo',
      });

      const data = (res.body as Body<TasksOverviewReport>).data;
      expect(data.range.startUtc).toBe('2026-10-28T21:00:00.000Z');
      expect(data.range.endUtc).toBe('2026-10-29T22:00:00.000Z');
    });

    it('returns null (not 0) when the denominator is 0, and still lists undated tasks', async () => {
      const res = await get(fullReader, '/reports/tasks-overview', {
        from: '2020-01-01',
        to: '2020-01-02',
        timezone: 'UTC',
      });

      const data = (res.body as Body<TasksOverviewReport>).data;
      expect(data.totalDueInRange).toBe(0);
      expect(data.completionRatePercent).toBeNull();
      expect(data.withoutDueDate.total).toBe(2);
    });

    it("isolates tenants: company B's tasks and company A's never mix", async () => {
      const res = await get(readerB, '/reports/tasks-overview', CAIRO_OCT_2026);

      const data = (res.body as Body<TasksOverviewReport>).data;
      expect(data.totalDueInRange).toBe(1);
      expect(data.completionRatePercent).toBe('100.00');
      expect(data.withoutDueDate).toEqual({ total: 0, open: 0 });
    });

    it('is gated by task:read only (a user without deal:read may still see it)', async () => {
      const res = await get(
        noDealReader,
        '/reports/tasks-overview',
        CAIRO_OCT_2026,
      );

      expect(res.status).toBe(200);
    });
  });

  // ------------------------------------------------------------- shared

  describe('shared input validation and authentication', () => {
    const paths = [
      '/reports/pipeline-snapshot',
      '/reports/leads-overview',
      '/reports/tasks-overview',
    ];

    it.each(paths)('%s requires authentication (401)', async (path) => {
      const res = await request(httpServer).get(path).query(CAIRO_OCT_2026);

      expect(res.status).toBe(401);
    });

    it.each(paths)('%s rejects an unknown time zone with 400', async (path) => {
      const res = await get(fullReader, path, {
        ...CAIRO_OCT_2026,
        timezone: 'Mars/Olympus',
      });

      expect(res.status).toBe(400);
    });

    it.each(paths)(
      '%s rejects a client-supplied companyId with 400 (tenant is token-only)',
      async (path) => {
        const res = await get(fullReader, path, {
          ...CAIRO_OCT_2026,
          companyId: companyB,
        });

        expect(res.status).toBe(400);
      },
    );

    it.each(paths)(
      '%s rejects bad dates, inverted and over-long ranges with 400',
      async (path) => {
        for (const bad of [
          { ...CAIRO_OCT_2026, from: '2026-02-30' },
          { ...CAIRO_OCT_2026, from: '2026-10-31', to: '2026-10-01' },
          { ...CAIRO_OCT_2026, from: '2025-01-01', to: '2026-12-31' },
          { from: '2026-10-01', to: '2026-10-31' }, // missing timezone
        ]) {
          const res = await get(fullReader, path, bad);
          expect(res.status).toBe(400);
        }
      },
    );

    it('accepts a legacy browser zone name (Asia/Calcutta) and resolves it with the correct +05:30 boundaries', async () => {
      const res = await get(fullReader, '/reports/tasks-overview', {
        from: '2026-10-01',
        to: '2026-10-01',
        timezone: 'Asia/Calcutta',
      });

      expect(res.status).toBe(200);
      const range = (res.body as Body<TasksOverviewReport>).data.range;
      expect(['Asia/Calcutta', 'Asia/Kolkata']).toContain(range.timezone);
      expect(range.startUtc).toBe('2026-09-30T18:30:00.000Z');
      expect(range.endUtc).toBe('2026-10-01T18:30:00.000Z');
    });

    it('does not let a hostile timezone string reach SQL (treated as data: rejected, tables intact)', async () => {
      const res = await get(fullReader, '/reports/tasks-overview', {
        ...CAIRO_OCT_2026,
        timezone: `Africa/Cairo'; DROP TABLE "Task";--`,
      });

      expect(res.status).toBe(400);
      expect(
        await harness.prisma.task.count({ where: { companyId: companyA } }),
      ).toBeGreaterThan(0);
    });
  });
});
