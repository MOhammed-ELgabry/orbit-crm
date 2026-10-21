/**
 * Contacts import (integration) — POST /contacts/import/validate and
 * POST /contacts/import.
 *
 * Runs against the real application and the real PostgreSQL test database
 * (`orbitcrm_test` only), through the same request pipeline as src/main.ts.
 * It needs the isolated test database, so it is NOT part of the plain unit
 * suite and must only be run through `npm run test:int` after the test
 * database has been prepared and approved separately.
 *
 * Authorization is the existing gate and nothing else: JwtAuthGuard (class) +
 * PermissionsGuard + CsrfGuard with contact:create. These tests use REAL
 * logins and the real guards (no overrideGuard, no synthetic context).
 *
 * Actors (4 logins; POST /auth/login is throttled to 5 per minute):
 * - A  : company A, role with contact:create + contact:read
 * - B  : company B, same kind of role (tenant isolation)
 * - R  : company A, role with contact:read ONLY            -> 403
 * - L  : company A, roleId null, non-owner (read-only D2)  -> 403
 * Anonymous requests are sent without any cookie            -> 401
 *
 * Every database assertion is made through Prisma, not only through the HTTP
 * status. Everything created here carries the harness marker and is
 * registered in the ledger immediately; only harness.cleanup() removes it.
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

const ACCESS_COOKIE = 'orbit_access_token';
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const BCRYPT_ROUNDS = 10; // same cost PasswordService uses

interface IssueBody {
  field: string;
  code: string;
}
interface ValidateRowBody {
  index: number;
  status: 'valid' | 'duplicate' | 'invalid';
  errors: IssueBody[];
  warnings: string[];
  duplicateReason?: string;
}
interface ImportRowBody {
  index: number;
  outcome: 'created' | 'duplicate' | 'invalid' | 'failed';
  errors: IssueBody[];
  contactId?: string;
}
interface ValidateResponse {
  statusCode: number;
  data: {
    rows: ValidateRowBody[];
    summary: { valid: number; duplicate: number; invalid: number };
  };
}
interface ImportResponse {
  statusCode: number;
  data: {
    rows: ImportRowBody[];
    summary: {
      created: number;
      duplicate: number;
      invalid: number;
      failed: number;
    };
  };
}

interface Actor {
  companyId: string;
  userId: string;
  email: string;
}

type Agent = ReturnType<typeof request.agent>;
interface Session {
  agent: Agent;
  csrf: string;
}

describe('Contacts import (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let password: string;

  let actorA: Actor;
  let actorB: Actor;
  let actorR: Actor;
  let actorL: Actor;
  let sessionA: Session;
  let sessionB: Session;
  let sessionR: Session;
  let sessionL: Session;

  // Probe last name shared by every contact this file creates in company A.
  let probe: string;

  async function createCompany(label: string): Promise<string> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(`import-company-${label}`) },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    return company.id;
  }

  async function createRole(
    companyId: string,
    label: string,
    actions: string[],
  ): Promise<string> {
    // READ-ONLY lookup of the shared Permission catalog (never modified here).
    const permissions = await harness.prisma.permission.findMany({
      where: { resource: 'contact', action: { in: actions } },
      select: { id: true },
    });
    if (permissions.length !== actions.length) {
      throw new Error(
        'The global Permission table in orbitcrm_test is missing the contact permissions this test needs.',
      );
    }
    const role = await harness.prisma.role.create({
      data: {
        companyId,
        name: harness.uniqueName(`import-role-${label}`),
        rolePermissions: {
          createMany: {
            data: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
      },
      select: { id: true },
    });
    harness.registerRole(role.id);
    return role.id;
  }

  async function createActor(
    label: string,
    companyId: string,
    roleId: string | null,
    passwordHash: string,
  ): Promise<Actor> {
    const email = harness.uniqueEmail(`import-user-${label}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Import',
        lastName: label.toUpperCase(),
        email,
        passwordHash,
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

  function cookieValue(
    setCookie: string[] | undefined,
    name: string,
  ): string | undefined {
    const entry = (setCookie ?? []).find((c) => c.startsWith(`${name}=`));
    return entry?.split(';')[0].slice(name.length + 1);
  }

  /** Real login through POST /auth/login; the agent keeps the cookies. */
  async function loginAs(actor: Actor): Promise<Session> {
    const agent = request.agent(httpServer);
    const res = await agent
      .post('/auth/login')
      .send({ email: actor.email, password });

    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] as unknown as
      string[] | undefined;
    expect(cookieValue(setCookie, ACCESS_COOKIE)).toBeTruthy();
    const csrf = cookieValue(setCookie, CSRF_COOKIE);
    expect(csrf).toBeTruthy();

    return { agent, csrf: csrf as string };
  }

  const validate = (session: Session, rows: unknown) =>
    session.agent
      .post('/contacts/import/validate')
      .set(CSRF_HEADER, session.csrf)
      .send({ rows });

  const importRows = (session: Session, rows: unknown) =>
    session.agent
      .post('/contacts/import')
      .set(CSRF_HEADER, session.csrf)
      .send({ rows });

  /** Registers every created contact for cleanup BEFORE any assertion. */
  const track = (res: request.Response): ImportResponse => {
    const body = res.body as ImportResponse;
    for (const row of body?.data?.rows ?? []) {
      if (typeof row.contactId === 'string') {
        harness.registerContact(row.contactId);
      }
    }
    return body;
  };

  const goodRow = (label: string, extra: Record<string, unknown> = {}) => ({
    firstName: `Imp${label}`,
    lastName: probe,
    email: harness.uniqueEmail(`import-${label}`),
    ...extra,
  });

  const countByProbe = () =>
    harness.prisma.contact.count({ where: { lastName: probe } });

  const countByEmail = (email: string) =>
    harness.prisma.contact.count({ where: { email } });

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same request pipeline as src/main.ts.
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
    expect(process.env.NODE_ENV).toBe('test');

    const config = app.get(ConfigService);
    const cookieDomain = config.get<string>('cookies.domain');
    if (cookieDomain && cookieDomain.trim() !== '') {
      throw new Error(
        `COOKIE_DOMAIN is set ("${cookieDomain}"): the login cookies would not be sent back to 127.0.0.1. Remove it from the test environment before running this test.`,
      );
    }
    if (config.get<boolean>('app.isProduction')) {
      throw new Error('Refusing to run: the app resolved to production mode.');
    }

    password = `Orbit-It-${harness.runId}`;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    probe = `ImportProbe-${harness.runId}`;

    const companyA = await createCompany('a');
    const companyB = await createCompany('b');

    const roleA = await createRole(companyA, 'a', ['create', 'read']);
    const roleB = await createRole(companyB, 'b', ['create', 'read']);
    const roleR = await createRole(companyA, 'r', ['read']);

    actorA = await createActor('a', companyA, roleA, passwordHash);
    actorB = await createActor('b', companyB, roleB, passwordHash);
    actorR = await createActor('r', companyA, roleR, passwordHash);
    actorL = await createActor('l', companyA, null, passwordHash);

    sessionA = await loginAs(actorA);
    sessionB = await loginAs(actorB);
    sessionR = await loginAs(actorR);
    sessionL = await loginAs(actorL);
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
        const report = await harness.cleanup();
        console.log(
          `[contacts-import] cleanup deleted: ${JSON.stringify(report.deleted)}`,
        );

        const [companies, users, contacts, sessions] = await Promise.all([
          harness.prisma.company.count({
            where: { id: { in: ids.createdCompanyIds } },
          }),
          harness.prisma.user.count({
            where: { id: { in: ids.createdUserIds } },
          }),
          harness.prisma.contact.count({
            where: { id: { in: ids.createdContactIds } },
          }),
          harness.prisma.authSession.count({
            where: { userId: { in: ids.createdUserIds } },
          }),
        ]);

        if (companies + users + contacts + sessions > 0) {
          throw new Error(
            `Cleanup left records behind: companies=${companies} users=${users} contacts=${contacts} sessions=${sessions}`,
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
        : new Error(String(cleanupError));
    }
  });

  // ------------------------------------------------- authentication / CSRF

  it('Test 1: anonymous requests are rejected with 401 and write nothing', async () => {
    const rows = [goodRow('anon')];

    const v = await request(httpServer)
      .post('/contacts/import/validate')
      .send({ rows });
    const i = await request(httpServer).post('/contacts/import').send({ rows });

    expect(v.status).toBe(401);
    expect(i.status).toBe(401);
    expect(await countByEmail(rows[0].email)).toBe(0);
  });

  it('Test 2: a logged-in request without the CSRF header is rejected with 403', async () => {
    const rows = [goodRow('nocsrf')];

    const v = await sessionA.agent
      .post('/contacts/import/validate')
      .send({ rows });
    const i = await sessionA.agent.post('/contacts/import').send({ rows });

    expect(v.status).toBe(403);
    expect(i.status).toBe(403);
    expect(await countByEmail(rows[0].email)).toBe(0);
  });

  // ------------------------------------------------------------------ RBAC

  it('Test 3: a role with contact:read only is denied (403) on both endpoints and nothing is written', async () => {
    const rows = [goodRow('ro')];

    const v = await validate(sessionR, rows);
    const i = await importRows(sessionR, rows);

    expect(v.status).toBe(403);
    expect(i.status).toBe(403);
    expect(await countByEmail(rows[0].email)).toBe(0);
  });

  it('Test 4: a non-owner without a role (read-only policy) is denied (403) on both endpoints', async () => {
    const rows = [goodRow('noroleuser')];

    const v = await validate(sessionL, rows);
    const i = await importRows(sessionL, rows);

    expect(v.status).toBe(403);
    expect(i.status).toBe(403);
    expect(await countByEmail(rows[0].email)).toBe(0);
  });

  // ------------------------------------------------------------- validate

  it('Test 5: validate reports valid / invalid / duplicate and writes nothing', async () => {
    const existing = goodRow('exists');
    const seed = track(await importRows(sessionA, [existing]));
    expect(seed.data.summary.created).toBe(1);
    const before = await countByProbe();

    const res = await validate(sessionA, [
      goodRow('fine'),
      { firstName: 'X', lastName: probe, email: 'not-an-email' },
      existing,
    ]);
    const body = res.body as ValidateResponse;

    expect(res.status).toBe(200);
    expect(body.data.rows.map((r) => r.status)).toEqual([
      'valid',
      'invalid',
      'duplicate',
    ]);
    expect(body.data.rows[2].duplicateReason).toBe('existsInCompany');
    expect(body.data.rows[1].errors.map((e) => e.field)).toContain('email');
    expect(await countByProbe()).toBe(before);
  });

  // --------------------------------------------------------------- import

  it('Test 6: import creates contacts in the caller company, created by the caller, with the import defaults', async () => {
    const row = goodRow('created', { phone: '+201001234567' });

    const res = await importRows(sessionA, [row]);
    const body = track(res);

    expect(res.status).toBe(200);
    expect(body.data.rows[0].outcome).toBe('created');

    const saved = await harness.prisma.contact.findUniqueOrThrow({
      where: { id: body.data.rows[0].contactId as string },
    });

    expect(saved.companyId).toBe(actorA.companyId);
    expect(saved.createdById).toBe(actorA.userId);
    expect(saved.assignedToId).toBeNull();
    expect(saved.status).toBe('active');
    expect(saved.source).toBe('Import');
    expect(saved.email).toBe(row.email);
    expect(saved.phone).toBe('+201001234567');
  });

  it('Test 7: rows that try to choose the company, creator or assignee are rejected and nothing is written', async () => {
    const before = await countByProbe();

    const res = await importRows(sessionA, [
      goodRow('evil1', { companyId: actorB.companyId }),
      goodRow('evil2', { createdById: actorB.userId }),
      goodRow('evil3', { assignedToId: actorA.userId }),
    ]);
    const body = track(res);

    expect(res.status).toBe(200);
    expect(body.data.rows.map((r) => r.outcome)).toEqual([
      'invalid',
      'invalid',
      'invalid',
    ]);
    expect(await countByProbe()).toBe(before);
  });

  it('Test 8: company isolation — the same email can be imported in both companies and neither sees the other', async () => {
    const email = harness.uniqueEmail('shared');

    const fromB = track(
      await importRows(sessionB, [
        { firstName: 'FromB', lastName: probe, email },
      ]),
    );
    expect(fromB.data.rows[0].outcome).toBe('created');

    // Company A: the email exists only in company B, so it is still valid...
    const check = await validate(sessionA, [
      { firstName: 'FromA', lastName: probe, email },
    ]);
    const checkBody = check.body as ValidateResponse;
    expect(checkBody.data.rows[0].status).toBe('valid');
    expect(JSON.stringify(checkBody)).not.toContain(
      fromB.data.rows[0].contactId as string,
    );

    // ...and importing it creates a separate contact in company A.
    const fromA = track(
      await importRows(sessionA, [
        { firstName: 'FromA', lastName: probe, email },
      ]),
    );
    expect(fromA.data.rows[0].outcome).toBe('created');

    const rows = await harness.prisma.contact.findMany({
      where: { email },
      select: { id: true, companyId: true },
    });
    expect(rows.map((r) => r.companyId).sort()).toEqual(
      [actorA.companyId, actorB.companyId].sort(),
    );
  });

  it('Test 9: re-sending the same rows (retry) skips them as duplicates and does not create anything', async () => {
    const rows = [goodRow('retry1'), goodRow('retry2')];

    const first = track(await importRows(sessionA, rows));
    expect(first.data.summary.created).toBe(2);
    const after = await countByProbe();

    const second = track(await importRows(sessionA, rows));

    expect(second.data.rows.map((r) => r.outcome)).toEqual([
      'duplicate',
      'duplicate',
    ]);
    expect(second.data.summary).toEqual({
      created: 0,
      duplicate: 2,
      invalid: 0,
      failed: 0,
    });
    expect(await countByProbe()).toBe(after);
  });

  it('Test 10: two concurrent imports of the same email create exactly one contact', async () => {
    const row = goodRow('race');

    const [r1, r2] = await Promise.all([
      importRows(sessionA, [row]),
      importRows(sessionA, [row]),
    ]);
    const b1 = track(r1);
    const b2 = track(r2);

    const outcomes = [b1.data.rows[0].outcome, b2.data.rows[0].outcome].sort();

    expect(outcomes).toEqual(['created', 'duplicate']);
    expect(await countByEmail(row.email)).toBe(1);
  });

  it('Test 11: a mixed request reports a partial result per row and keeps going', async () => {
    const dup = goodRow('mixdup');
    track(await importRows(sessionA, [dup]));

    const res = await importRows(sessionA, [
      goodRow('mixgood1'),
      dup,
      { firstName: 'X', lastName: probe },
      goodRow('mixgood2'),
    ]);
    const body = track(res);

    expect(body.data.rows.map((r) => r.outcome)).toEqual([
      'created',
      'duplicate',
      'invalid',
      'created',
    ]);
    expect(body.data.summary).toEqual({
      created: 2,
      duplicate: 1,
      invalid: 1,
      failed: 0,
    });
  });

  it('Test 12: rows without an email are imported (with a warning)', async () => {
    const res = await validate(sessionA, [
      { firstName: 'NoMail', lastName: probe },
    ]);
    const body = res.body as ValidateResponse;

    expect(body.data.rows[0].status).toBe('valid');
    expect(body.data.rows[0].warnings).toContain('noEmail');

    const imported = track(
      await importRows(sessionA, [{ firstName: 'NoMail', lastName: probe }]),
    );
    expect(imported.data.rows[0].outcome).toBe('created');
  });

  // ---------------------------------------------------------------- limits

  it('Test 13: an empty list, a non-object row and more than 100 rows are rejected with 400', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => goodRow(`many${i}`));
    const before = await countByProbe();

    expect((await validate(sessionA, [])).status).toBe(400);
    expect((await importRows(sessionA, ['text'])).status).toBe(400);
    expect((await importRows(sessionA, tooMany)).status).toBe(400);
    expect(await countByProbe()).toBe(before);
  });
});
