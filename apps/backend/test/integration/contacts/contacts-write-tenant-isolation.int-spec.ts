/**
 * Contacts - WRITE-side tenant isolation (integration).
 *
 * Runs against the real application and the real PostgreSQL test database
 * (`orbitcrm_test` only). Companion to contacts-tenant-isolation.int-spec.ts
 * (read side).
 *
 * CURRENT production contract this file encodes (src/modules/contact):
 *
 *   POST   /contacts      JwtAuthGuard (class) + PermissionsGuard + CsrfGuard,
 *                         @RequirePermissions contact:create   -> 201
 *   PATCH  /contacts/:id  JwtAuthGuard (class) + PermissionsGuard + CsrfGuard,
 *                         @RequirePermissions contact:update   -> 200 / 404
 *   DELETE /contacts/:id  JwtAuthGuard (class) + PermissionsGuard + CsrfGuard,
 *                         @RequirePermissions contact:delete   -> 200 / 404
 *                         (soft delete: sets Contact.deletedAt)
 *
 * - The tenant (companyId) and the creator (createdById) of a new contact are
 *   taken from the JWT, never from the body.
 * - `companyId` is NOT a field of CreateContactDto / UpdateContactDto, and the
 *   global ValidationPipe uses `forbidNonWhitelisted`, so sending `companyId`
 *   is rejected with 400 before the controller runs. This is the real
 *   "write into another tenant" attempt on the body.
 * - The one writable input that references another tenant's data is
 *   `assignedToId` (a User id). ContactService verifies it belongs to the
 *   caller's company and answers 404 otherwise, for create and update.
 * - Cross-tenant PATCH / DELETE of an existing contact answer 404 (not 403):
 *   the repository scopes by { id, companyId, deletedAt: null }, so another
 *   company's contact is indistinguishable from a missing one.
 * - CSRF is double-submit: the `orbit_csrf_token` cookie (kept by the agent)
 *   must equal the `x-csrf-token` header. Unauthenticated requests are
 *   rejected by JwtAuthGuard (401) before CSRF is evaluated.
 * - Users here are `isOwner: false`, `roleId: null`. PermissionsGuard lets a
 *   role-less non-owner through (legacy shim), so no Roles/RolePermissions are
 *   needed. This file therefore tests tenant isolation, NOT RBAC.
 *
 * Every assertion on a cross-tenant attempt also checks the database through
 * Prisma, not only the HTTP status. Records are created with marker
 * names/emails and registered in the harness ledger immediately; only
 * `harness.cleanup()` removes them.
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
const UNAUTHENTICATED_MESSAGE = 'Authentication required.';

interface ContactBody {
  id: string;
  companyId: string;
  createdById: string;
  assignedToId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
}

interface ItemBody {
  success: boolean;
  statusCode: number;
  data: ContactBody;
}

interface ErrorBody {
  success: boolean;
  statusCode: number;
  message: string;
  data?: unknown;
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

/** An authenticated agent (cookie jar) plus the CSRF value for its header. */
interface Session {
  agent: Agent;
  csrf: string;
}

describe('Contacts write-side tenant isolation (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let sessionA: Session;

  // Company A: one contact to update, one to delete (tests stay independent).
  let contactAUpdateId: string;
  let contactADeleteId: string;
  // Company B: the contact User A must never be able to touch.
  let contactBId: string;

  // Random per run: never a fixed, committed credential.
  let password: string;

  async function createTenant(
    label: 'a' | 'b',
    passwordHash: string,
  ): Promise<Tenant> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(`write-company-${label}`) },
      select: { id: true },
    });
    harness.registerCompany(company.id);

    const email = harness.uniqueEmail(`write-user-${label}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Tenant',
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

  async function createSeedContact(
    tenant: Tenant,
    label: string,
  ): Promise<string> {
    const contact = await harness.prisma.contact.create({
      data: {
        companyId: tenant.companyId,
        createdById: tenant.userId,
        firstName: 'Seed',
        lastName: `Seed-${label}-${harness.runId}`,
        phone: '+201000000000',
        notes: `seed notes ${label}`,
      },
      select: { id: true },
    });
    harness.registerContact(contact.id);
    return contact.id;
  }

  function cookieValue(
    setCookie: string[] | undefined,
    name: string,
  ): string | undefined {
    const entry = (setCookie ?? []).find((cookie) =>
      cookie.startsWith(`${name}=`),
    );
    return entry?.split(';')[0].slice(name.length + 1);
  }

  /** Real login through POST /auth/login; the agent keeps the cookies. */
  async function loginAs(tenant: Tenant): Promise<Session> {
    const agent = request.agent(httpServer);

    const res = await agent
      .post('/auth/login')
      .send({ email: tenant.email, password });

    expect(res.status).toBe(200);

    const setCookie = res.headers['set-cookie'] as unknown as
      string[] | undefined;
    expect(cookieValue(setCookie, ACCESS_COOKIE)).toBeTruthy();

    const csrf = cookieValue(setCookie, CSRF_COOKIE);
    expect(csrf).toBeTruthy();

    const body = res.body as LoginBody;
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(tenant.userId);
    // Non-owner: no owner bypass in play.
    expect(body.user.isOwner).toBe(false);

    return { agent, csrf: csrf as string };
  }

  const post = (session: Session, body: Record<string, unknown>) =>
    session.agent.post('/contacts').set(CSRF_HEADER, session.csrf).send(body);

  const patch = (session: Session, id: string, body: Record<string, unknown>) =>
    session.agent
      .patch(`/contacts/${id}`)
      .set(CSRF_HEADER, session.csrf)
      .send(body);

  const del = (session: Session, id: string) =>
    session.agent.delete(`/contacts/${id}`).set(CSRF_HEADER, session.csrf);

  /** Full row, straight from the database (includes soft-deleted rows). */
  const rowOf = (id: string) =>
    harness.prisma.contact.findUniqueOrThrow({ where: { id } });

  /** Every Company B contact row, soft-deleted ones included. */
  const rowsOfCompanyB = () =>
    harness.prisma.contact.findMany({
      where: { companyId: tenantB.companyId },
      orderBy: { id: 'asc' },
    });

  /** How many contacts, in ANY company, carry this probe last name. */
  const countByLastName = (lastName: string) =>
    harness.prisma.contact.count({ where: { lastName } });

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Same request pipeline as src/main.ts (AppModule alone does not set
    // these up). main.ts-only concerns (CORS, helmet, swagger, trust proxy)
    // are irrelevant to this test.
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

    // The application's own database connection must also be the test DB.
    const rows = await app.get(PrismaService).$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(rows[0]?.current_database).toBe('orbitcrm_test');
    expect(process.env.NODE_ENV).toBe('test');

    // Fail fast, with a clear message, on configuration that would make the
    // session cookies unusable on localhost. Nothing is modified.
    const config = app.get(ConfigService);
    const cookieDomain = config.get<string>('cookies.domain');
    if (cookieDomain && cookieDomain.trim() !== '') {
      throw new Error(
        `COOKIE_DOMAIN is set ("${cookieDomain}"). The login cookies would not be sent back to 127.0.0.1, ` +
          'so every authenticated request would fail with 401. Remove it from the test environment ' +
          '(.env / .env.local / .env.test) before running this test.',
      );
    }
    if (config.get<boolean>('app.isProduction')) {
      throw new Error('Refusing to run: the app resolved to production mode.');
    }

    password = `Orbit-It-${harness.runId}`;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    tenantA = await createTenant('a', passwordHash);
    tenantB = await createTenant('b', passwordHash);

    contactAUpdateId = await createSeedContact(tenantA, 'a-update');
    contactADeleteId = await createSeedContact(tenantA, 'a-delete');
    contactBId = await createSeedContact(tenantB, 'b');

    // Only User A acts in this file. One login (POST /auth/login is
    // throttled to 5 per minute).
    sessionA = await loginAs(tenantA);
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
        // Snapshot before cleanup() empties the ledger.
        const ids = harness.createdIds();

        const report = await harness.cleanup();
        console.log(
          `[contacts-write-tenant-isolation] cleanup deleted: ${JSON.stringify(report.deleted)}`,
        );

        // Read-only proof that nothing this test created is left behind.
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

  // ---------------------------------------------------------------- create

  it('Test 1: user A can create a contact, and it belongs to company A', async () => {
    const payload = {
      firstName: 'Created',
      lastName: `Created-${harness.runId}`,
      email: harness.uniqueEmail('created-contact'),
      organizationName: 'Orbit IT Org',
    };

    const res = await post(sessionA, payload);
    const body = res.body as ItemBody;

    // Register for cleanup BEFORE asserting anything, so a failing
    // assertion below cannot leave the row behind.
    const createdId = body.data?.id;
    if (typeof createdId === 'string') {
      harness.registerContact(createdId);
    }

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(typeof createdId).toBe('string');
    expect(body.data.companyId).toBe(tenantA.companyId);
    expect(body.data.companyId).not.toBe(tenantB.companyId);
    expect(body.data.createdById).toBe(tenantA.userId);
    expect(body.data.lastName).toBe(payload.lastName);

    // Database truth, not just the response.
    const row = await rowOf(createdId);
    expect(row.companyId).toBe(tenantA.companyId);
    expect(row.createdById).toBe(tenantA.userId);
    expect(row.deletedAt).toBeNull();
    expect(
      await harness.prisma.contact.count({
        where: { id: createdId, companyId: tenantB.companyId },
      }),
    ).toBe(0);
  });

  it('Test 2a: user A cannot create a contact for company B by sending companyId (400)', async () => {
    // CreateContactDto has no `companyId`; the global ValidationPipe
    // (forbidNonWhitelisted) rejects the unknown property outright.
    const companyBBefore = await rowsOfCompanyB();
    const lastName = `Smuggle-body-${harness.runId}`;

    const res = await post(sessionA, {
      firstName: 'Smuggle',
      lastName,
      companyId: tenantB.companyId,
    });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toContain('companyId');

    // Nothing was created anywhere, and Company B is byte-for-byte unchanged.
    expect(await countByLastName(lastName)).toBe(0);
    expect(await rowsOfCompanyB()).toEqual(companyBBefore);
  });

  it("Test 2b: user A cannot create a contact assigned to company B's user (404)", async () => {
    // `assignedToId` is the only writable input that references another
    // tenant's data. ContactService answers 404, same as for a missing user.
    const companyBBefore = await rowsOfCompanyB();
    const lastName = `Smuggle-assignee-${harness.runId}`;

    const res = await post(sessionA, {
      firstName: 'Smuggle',
      lastName,
      assignedToId: tenantB.userId,
    });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.message).toContain('assignedToId');

    expect(await countByLastName(lastName)).toBe(0);
    expect(await rowsOfCompanyB()).toEqual(companyBBefore);
  });

  // ---------------------------------------------------------------- update

  it('Test 3: user A can update a contact of company A', async () => {
    const before = await rowOf(contactAUpdateId);

    const res = await patch(sessionA, contactAUpdateId, {
      firstName: 'Updated',
      phone: '+201001234567',
      notes: 'updated by user A',
      status: 'customer',
    });
    const body = res.body as ItemBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(contactAUpdateId);
    expect(body.data.firstName).toBe('Updated');
    expect(body.data.phone).toBe('+201001234567');
    expect(body.data.notes).toBe('updated by user A');
    expect(body.data.status).toBe('customer');
    expect(body.data.companyId).toBe(tenantA.companyId);

    const after = await rowOf(contactAUpdateId);
    expect(after.firstName).toBe('Updated');
    expect(after.phone).toBe('+201001234567');
    expect(after.notes).toBe('updated by user A');
    expect(after.status).toBe('customer');
    // Still owned by Company A and attributed to the original creator.
    expect(after.companyId).toBe(tenantA.companyId);
    expect(after.createdById).toBe(before.createdById);
    // Untouched fields stay as they were.
    expect(after.lastName).toBe(before.lastName);
    expect(after.deletedAt).toBeNull();
  });

  it('Test 3b: user A cannot move their own contact to company B by sending companyId (400)', async () => {
    const before = await rowOf(contactAUpdateId);
    const companyBBefore = await rowsOfCompanyB();

    const res = await patch(sessionA, contactAUpdateId, {
      companyId: tenantB.companyId,
    });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toContain('companyId');

    expect(await rowOf(contactAUpdateId)).toEqual(before);
    expect(await rowsOfCompanyB()).toEqual(companyBBefore);
  });

  it("Test 4: user A cannot update company B's contact (404, data unchanged)", async () => {
    const before = await rowOf(contactBId);
    const companyBBefore = await rowsOfCompanyB();

    const res = await patch(sessionA, contactBId, {
      firstName: 'Hijacked',
      notes: 'modified by user A',
    });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();

    // Database truth: the row is exactly as it was, updatedAt included.
    expect(await rowOf(contactBId)).toEqual(before);
    expect(await rowsOfCompanyB()).toEqual(companyBBefore);
  });

  it("Test 4b: user A cannot assign their own contact to company B's user (404, data unchanged)", async () => {
    const before = await rowOf(contactAUpdateId);

    const res = await patch(sessionA, contactAUpdateId, {
      assignedToId: tenantB.userId,
    });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.message).toContain('assignedToId');

    const after = await rowOf(contactAUpdateId);
    expect(after).toEqual(before);
    expect(after.assignedToId).not.toBe(tenantB.userId);
  });

  // ---------------------------------------------------------------- delete

  it('Test 5: user A can delete (soft-delete) a contact of company A', async () => {
    const before = await rowOf(contactADeleteId);
    expect(before.deletedAt).toBeNull();

    const res = await del(sessionA, contactADeleteId);
    const body = res.body as ErrorBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Soft delete: the row still exists, with deletedAt set, still Company A's.
    const after = await rowOf(contactADeleteId);
    expect(after.deletedAt).not.toBeNull();
    expect(after.companyId).toBe(tenantA.companyId);

    // ...and the API no longer serves it.
    const readBack = await sessionA.agent.get(`/contacts/${contactADeleteId}`);
    expect(readBack.status).toBe(404);
  });

  it("Test 6: user A cannot delete company B's contact (404, contact intact)", async () => {
    const before = await rowOf(contactBId);
    const companyBBefore = await rowsOfCompanyB();

    const res = await del(sessionA, contactBId);
    const body = res.body as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);

    const after = await rowOf(contactBId);
    expect(after.deletedAt).toBeNull();
    expect(after).toEqual(before);
    expect(await rowsOfCompanyB()).toEqual(companyBBefore);
  });

  // --------------------------------------------------------- unauthenticated

  it('Test 7: unauthenticated write requests are rejected with 401 and change nothing', async () => {
    const targetBefore = await rowOf(contactAUpdateId);
    const companyBBefore = await rowsOfCompanyB();
    const lastName = `Anonymous-${harness.runId}`;

    // Plain requests (no agent): no cookies, no Authorization header.
    const created = await request(httpServer)
      .post('/contacts')
      .send({ firstName: 'Anonymous', lastName });
    expect(created.status).toBe(401);
    expect((created.body as ErrorBody).message).toBe(UNAUTHENTICATED_MESSAGE);

    const updated = await request(httpServer)
      .patch(`/contacts/${contactAUpdateId}`)
      .send({ firstName: 'Anonymous' });
    expect(updated.status).toBe(401);
    expect((updated.body as ErrorBody).message).toBe(UNAUTHENTICATED_MESSAGE);

    const deleted = await request(httpServer).delete(
      `/contacts/${contactAUpdateId}`,
    );
    expect(deleted.status).toBe(401);
    expect((deleted.body as ErrorBody).message).toBe(UNAUTHENTICATED_MESSAGE);

    // Database truth: nothing created, modified or deleted, in either company.
    expect(await countByLastName(lastName)).toBe(0);
    expect(await rowOf(contactAUpdateId)).toEqual(targetBefore);
    expect(await rowsOfCompanyB()).toEqual(companyBBefore);
  });
});
