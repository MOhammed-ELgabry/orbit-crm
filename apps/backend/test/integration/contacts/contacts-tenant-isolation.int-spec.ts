/**
 * Contacts - tenant isolation (integration).
 *
 * Proves, against the real application + the real PostgreSQL test database
 * (`orbitcrm_test` only), that:
 *   - a user sees only the contacts of their own company;
 *   - a contact of another company is indistinguishable from "not found" (404);
 *   - unauthenticated requests are rejected (401).
 *
 * Authentication is the application's real flow: POST /auth/login sets the
 * HttpOnly session cookies and each user keeps them in a dedicated supertest
 * agent. No token is extracted or forged by hand.
 *
 * Users are NOT owners and have no role (`isOwner: false`, `roleId: null`):
 * no Roles / RolePermissions are created here, and RBAC is deliberately not
 * part of this test. GET /contacts has no PermissionsGuard, so isolation
 * rests on the companyId inside the JWT plus repository scoping.
 *
 * All records are created through the harness-owned Prisma client with
 * marker names/emails, registered in the harness ledger immediately after
 * creation, and removed only by `harness.cleanup()`.
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
const BCRYPT_ROUNDS = 10; // same cost PasswordService uses

interface ContactBody {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
}

interface ListBody {
  success: boolean;
  statusCode: number;
  data: ContactBody[];
  meta: { page: number; limit: number; total: number };
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
  label: 'a' | 'b';
  companyId: string;
  userId: string;
  email: string;
  contactId: string;
  contactFirstName: string;
  contactLastName: string;
}

type Agent = ReturnType<typeof request.agent>;

describe('Contacts tenant isolation (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let agentA: Agent;
  let agentB: Agent;

  // Random per run: never a fixed, committed credential.
  let password: string;

  /**
   * Creates Company + non-owner User + Contact for one tenant. Every record
   * is registered in the harness ledger as soon as it exists, so a failure
   * halfway still gets cleaned up.
   */
  async function createTenant(
    label: 'a' | 'b',
    passwordHash: string,
  ): Promise<Tenant> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(`company-${label}`) },
      select: { id: true },
    });
    harness.registerCompany(company.id);

    const email = harness.uniqueEmail(`user-${label}`);
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

    const contactFirstName = `Isolation${label.toUpperCase()}`;
    const contactLastName = `Contact-${label}-${harness.runId}`;
    const contact = await harness.prisma.contact.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        firstName: contactFirstName,
        lastName: contactLastName,
      },
      select: { id: true },
    });
    harness.registerContact(contact.id);

    return {
      label,
      companyId: company.id,
      userId: user.id,
      email,
      contactId: contact.id,
      contactFirstName,
      contactLastName,
    };
  }

  /** Real login through POST /auth/login; the agent keeps the cookies. */
  async function loginAs(tenant: Tenant): Promise<Agent> {
    const agent = request.agent(httpServer);

    const res = await agent
      .post('/auth/login')
      .send({ email: tenant.email, password });

    expect(res.status).toBe(200);

    const setCookie = res.headers['set-cookie'] as unknown as
      string[] | undefined;
    expect(Array.isArray(setCookie)).toBe(true);
    expect(
      (setCookie ?? []).some((cookie) =>
        cookie.startsWith(`${ACCESS_COOKIE}=`),
      ),
    ).toBe(true);

    const body = res.body as LoginBody;
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(tenant.userId);
    // The whole point of using non-owners: no owner bypass in play.
    expect(body.user.isOwner).toBe(false);

    return agent;
  }

  /** The other tenant's data must not appear anywhere in a response. */
  function expectNoTraceOf(foreign: Tenant, body: unknown): void {
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(foreign.contactId);
    expect(serialized).not.toContain(foreign.contactLastName);
    expect(serialized).not.toContain(foreign.companyId);
  }

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

    // One login per user (POST /auth/login is throttled to 5 per minute).
    agentA = await loginAs(tenantA);
    agentB = await loginAs(tenantB);
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
          `[contacts-tenant-isolation] cleanup deleted: ${JSON.stringify(report.deleted)}`,
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

  it('Test 1: user A lists only the contacts of company A', async () => {
    const res = await agentA.get('/contacts');
    const body = res.body as ListBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(tenantA.contactId);
    expect(body.data[0].companyId).toBe(tenantA.companyId);
    expectNoTraceOf(tenantB, body);
  });

  it('Test 2: user A cannot read the contact of company B (404)', async () => {
    const res = await agentA.get(`/contacts/${tenantB.contactId}`);
    const body = res.body as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(404);
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(tenantB.contactLastName);
    expect(JSON.stringify(body)).not.toContain(tenantB.companyId);
  });

  it('Test 3: user B lists only the contacts of company B', async () => {
    const res = await agentB.get('/contacts');
    const body = res.body as ListBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(tenantB.contactId);
    expect(body.data[0].companyId).toBe(tenantB.companyId);
    expectNoTraceOf(tenantA, body);
  });

  it('Test 4: user B cannot read the contact of company A (404)', async () => {
    const res = await agentB.get(`/contacts/${tenantA.contactId}`);
    const body = res.body as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(404);
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(tenantA.contactLastName);
    expect(JSON.stringify(body)).not.toContain(tenantA.companyId);
  });

  it('Test 5: each user can read the contact of their own company (200)', async () => {
    const resA = await agentA.get(`/contacts/${tenantA.contactId}`);
    const bodyA = resA.body as ItemBody;

    expect(resA.status).toBe(200);
    expect(bodyA.data.id).toBe(tenantA.contactId);
    expect(bodyA.data.companyId).toBe(tenantA.companyId);

    const resB = await agentB.get(`/contacts/${tenantB.contactId}`);
    const bodyB = resB.body as ItemBody;

    expect(resB.status).toBe(200);
    expect(bodyB.data.id).toBe(tenantB.contactId);
    expect(bodyB.data.companyId).toBe(tenantB.companyId);
  });

  it('Test 6: unauthenticated requests are rejected with 401', async () => {
    // A plain request (not an agent): no cookies, no Authorization header.
    const list = await request(httpServer).get('/contacts');
    const listBody = list.body as ErrorBody;

    expect(list.status).toBe(401);
    expect(listBody.message).toBe('Authentication required.');

    const single = await request(httpServer).get(
      `/contacts/${tenantA.contactId}`,
    );
    const singleBody = single.body as ErrorBody;

    expect(single.status).toBe(401);
    expect(singleBody.message).toBe('Authentication required.');
    expect(JSON.stringify(singleBody)).not.toContain(tenantA.contactLastName);
  });
});
