/**
 * Access-control hardening (integration) — decisions D1, D2 and D3.
 *
 * Runs against the real application and the real PostgreSQL test database
 * (`orbitcrm_test` only).
 *
 * D1  The 10 read handlers (list + detail for deals, leads, tasks, contacts,
 *     activities) are protected by PermissionsGuard + `<resource>:read`.
 *     A user whose role lacks the read permission gets 403 on all ten.
 *
 * D2  A non-owner with `roleId = null` is READ-ONLY: every CRM GET is
 *     allowed, every write is 403, and `/auth/me` lists only `read`
 *     permissions. Deleting a user's role (FK ON DELETE SET NULL) therefore
 *     demotes them to read-only instead of escalating them to full access.
 *
 *     Self-service settings (own language, appearance, notification
 *     preferences) are not permission-gated and keep working.
 *
 * D3  JwtAuthGuard consults the database on every request: a user who is
 *     deactivated (or soft-deleted) after receiving a perfectly valid,
 *     unexpired access token is rejected with 401 on the very next request,
 *     and a reactivated account works again with the same token.
 *
 * Fixtures: one company, created per run; users are created straight in the
 * database and authenticated by signing access tokens with the application's
 * own JwtService (so the 5/min login throttle is not a factor). One user also
 * goes through the real POST /auth/login so `/auth/me`-style permissions are
 * proven on the real login payload. The global Permission table is read
 * only. Everything created is registered in the harness ledger.
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
import { RoleService } from '../../../src/modules/role/role.service';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const ACCESS_COOKIE = 'orbit_access_token';
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_VALUE = 'csrf-test-value';
const BCRYPT_ROUNDS = 10;
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';
const MISSING_ID = 'clmissing0000000000000000';

const CRM_RESOURCES = [
  { resource: 'deal', path: '/deals' },
  { resource: 'lead', path: '/leads' },
  { resource: 'task', path: '/tasks' },
  { resource: 'contact', path: '/contacts' },
  { resource: 'activity', path: '/activities' },
] as const;

interface Actor {
  id: string;
  email: string;
  isOwner: boolean;
  companyId: string;
}

describe('Access-control hardening D1 / D2 / D3 (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let jwt: JwtService;
  let prisma: PrismaService;

  let companyId: string;
  let password: string;
  let passwordHash: string;
  let readRoleId: string;
  let emptyRoleId: string;

  const permissionIds = new Map<string, string>();
  let sequence = 0;

  async function createUser(
    label: string,
    options: { roleId: string | null; isActive?: boolean },
  ): Promise<Actor> {
    sequence += 1;
    const email = harness.uniqueEmail(`${label}-${sequence}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Hardening',
        lastName: label,
        email,
        passwordHash,
        isEmailVerified: true,
        isActive: options.isActive ?? true,
        isOwner: false,
        companyId,
        roleId: options.roleId,
      },
      select: { id: true },
    });
    harness.registerUser(user.id);
    return { id: user.id, email, isOwner: false, companyId };
  }

  async function createRole(label: string, keys: string[]): Promise<string> {
    const role = await harness.prisma.role.create({
      data: {
        companyId,
        name: harness.uniqueName(`${label}-${(sequence += 1)}`),
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

  /** A valid, unexpired access token signed by the application's own key. */
  const tokenFor = (actor: Actor): string =>
    jwt.sign({
      sub: actor.id,
      companyId: actor.companyId,
      email: actor.email,
      isOwner: actor.isOwner,
    });

  const get = (actor: Actor, path: string) =>
    request(httpServer)
      .get(path)
      .set('Cookie', [`${ACCESS_COOKIE}=${tokenFor(actor)}`]);

  const post = (actor: Actor, path: string, body: Record<string, unknown>) =>
    request(httpServer)
      .post(path)
      .set('Cookie', [
        `${ACCESS_COOKIE}=${tokenFor(actor)}`,
        `${CSRF_COOKIE}=${CSRF_VALUE}`,
      ])
      .set(CSRF_HEADER, CSRF_VALUE)
      .send(body);

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

    // READ-ONLY lookup of the shared Permission catalog.
    const catalog = await harness.prisma.permission.findMany({
      select: { id: true, resource: true, action: true },
    });
    for (const p of catalog) {
      permissionIds.set(`${p.resource}:${p.action}`, p.id);
    }
    const needed = [
      ...CRM_RESOURCES.map((r) => `${r.resource}:read`),
      'contact:create',
    ];
    const missing = needed.filter((key) => !permissionIds.has(key));
    if (missing.length > 0) {
      throw new Error(
        `The global Permission table in orbitcrm_test is missing: ${missing.join(', ')}.`,
      );
    }

    password = `Orbit-It-${harness.runId}`;
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName('hardening-company') },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    companyId = company.id;

    readRoleId = await createRole(
      'hardening-read-all',
      CRM_RESOURCES.map((r) => `${r.resource}:read`),
    );
    emptyRoleId = await createRole('hardening-empty', []);
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
        await harness.cleanup();

        const [companies, roles, users, sessions] = await Promise.all([
          harness.prisma.company.count({
            where: { id: { in: ids.createdCompanyIds } },
          }),
          harness.prisma.role.count({
            where: { id: { in: ids.createdRoleIds } },
          }),
          harness.prisma.user.count({
            where: { id: { in: ids.createdUserIds } },
          }),
          harness.prisma.authSession.count({
            where: { userId: { in: ids.createdUserIds } },
          }),
        ]);
        if (companies + roles + users + sessions > 0) {
          throw new Error(
            `Cleanup left records behind: companies=${companies} roles=${roles} users=${users} sessions=${sessions}`,
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

  // -------------------------------------------------------------------- D1

  describe('D1 — CRM read handlers require <resource>:read', () => {
    it.each(
      CRM_RESOURCES.flatMap((r) => [
        { name: `GET ${r.path}`, path: r.path },
        { name: `GET ${r.path}/:id`, path: `${r.path}/${MISSING_ID}` },
      ]),
    )(
      'denies $name (403) to a role without the read permission',
      async ({ path }) => {
        const actor = await createUser('d1-no-read', { roleId: emptyRoleId });

        const res = await get(actor, path);

        expect(res.status).toBe(403);
        expect((res.body as { message: string }).message).toBe(
          FORBIDDEN_MESSAGE,
        );
      },
    );

    it.each(CRM_RESOURCES.map((r) => ({ resource: r.resource, path: r.path })))(
      'allows GET $path (200) to a role granted $resource:read',
      async ({ path }) => {
        const actor = await createUser('d1-reader', { roleId: readRoleId });

        const res = await get(actor, path);

        expect(res.status).toBe(200);
      },
    );

    it.each(CRM_RESOURCES.map((r) => ({ path: r.path })))(
      'reaches the service for GET $path/:id with the read role (404 for an unknown id, not 403)',
      async ({ path }) => {
        const actor = await createUser('d1-reader-detail', {
          roleId: readRoleId,
        });

        const res = await get(actor, `${path}/${MISSING_ID}`);

        expect(res.status).toBe(404);
      },
    );

    it('still rejects unauthenticated requests with 401 before any permission check', async () => {
      for (const { path } of CRM_RESOURCES) {
        const res = await request(httpServer).get(path);
        expect(res.status).toBe(401);
      }
    });
  });

  // -------------------------------------------------------------------- D2

  describe('D2 — roleId = null is read-only', () => {
    it.each(CRM_RESOURCES.map((r) => ({ path: r.path })))(
      'allows GET $path (200) for a role-less user',
      async ({ path }) => {
        const actor = await createUser('d2-roleless-read', { roleId: null });

        const res = await get(actor, path);

        expect(res.status).toBe(200);
      },
    );

    it('denies a CRM write (POST /contacts) for a role-less user with the standard 403', async () => {
      const actor = await createUser('d2-roleless-write', { roleId: null });
      const before = await harness.prisma.contact.count({
        where: { companyId },
      });

      const res = await post(actor, '/contacts', {
        firstName: 'Should',
        lastName: `NotExist-${harness.runId}`,
        phone: '+201000000001',
      });

      expect(res.status).toBe(403);
      expect((res.body as { message: string }).message).toBe(FORBIDDEN_MESSAGE);
      expect(await harness.prisma.contact.count({ where: { companyId } })).toBe(
        before,
      );
    });

    it('lists only read permissions in the real login payload of a role-less user', async () => {
      const actor = await createUser('login', { roleId: null });

      const res = await request(httpServer)
        .post('/auth/login')
        .send({ email: actor.email, password });

      expect(res.status).toBe(200);
      const permissions = (res.body as { user: { permissions: string[] } }).user
        .permissions;
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions.every((p) => p.endsWith(':read'))).toBe(true);
      for (const { resource } of CRM_RESOURCES) {
        expect(permissions).toContain(`${resource}:read`);
      }
      expect(permissions).not.toContain('contact:create');
    });

    it('demotes (never escalates) a user whose role is deleted: read still works, writes are 403', async () => {
      const writeRoleId = await createRole('d2-deletable-write', [
        'contact:create',
        'contact:read',
      ]);
      const actor = await createUser('d2-role-deleted', {
        roleId: writeRoleId,
      });

      // With the role, the write passes the permission gate (it may fail
      // later for other reasons; the point is that it is NOT 403).
      const withRole = await post(actor, '/contacts', {});
      expect(withRole.status).not.toBe(403);

      // The product's real deletion path: RoleService.remove() soft-deletes
      // the role and unassigns it from everyone who held it.
      await app!
        .get(RoleService, { strict: false })
        .remove(companyId, writeRoleId);
      const after = await harness.prisma.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { roleId: true },
      });
      expect(after.roleId).toBeNull();

      const write = await post(actor, '/contacts', {
        firstName: 'Should',
        lastName: `NotExist-${harness.runId}`,
        phone: '+201000000002',
      });
      expect(write.status).toBe(403);
      expect((write.body as { message: string }).message).toBe(
        FORBIDDEN_MESSAGE,
      );

      const read = await get(actor, '/contacts');
      expect(read.status).toBe(200);
    });

    it('preserves self-service settings for a role-less user (language, appearance, notification preferences)', async () => {
      const actor = await createUser('d2-selfservice', { roleId: null });
      const csrfCookies = [
        `${ACCESS_COOKIE}=${tokenFor(actor)}`,
        `${CSRF_COOKIE}=${CSRF_VALUE}`,
      ];
      const send = (method: 'patch' | 'put', path: string, body: object) =>
        request(httpServer)
          [method](path)
          .set('Cookie', csrfCookies)
          .set(CSRF_HEADER, CSRF_VALUE)
          .send(body);

      const language = await send('patch', `/users/${actor.id}/language`, {
        language: 'ar',
      });
      expect(language.status).toBe(200);

      const appearance = await send('patch', `/users/${actor.id}/appearance`, {
        backgroundColor: '#F6F8FC',
      });
      expect(appearance.status).toBe(200);

      const preference = await send('put', '/notifications/preferences', {
        channel: 'email',
        enabled: false,
      });
      expect(preference.status).toBe(200);

      const saved = await harness.prisma.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { language: true, backgroundColor: true },
      });
      expect(saved).toEqual({ language: 'ar', backgroundColor: '#F6F8FC' });
    });

    it('keeps company isolation: a role-less user only ever reads their own company', async () => {
      const actor = await createUser('d2-roleless-iso', { roleId: null });
      const otherCompany = await harness.prisma.company.create({
        data: { name: harness.uniqueName('hardening-other-company') },
        select: { id: true },
      });
      harness.registerCompany(otherCompany.id);
      const otherUser = await harness.prisma.user.create({
        data: {
          firstName: 'Other',
          lastName: 'Tenant',
          email: harness.uniqueEmail('d2-other-tenant'),
          passwordHash,
          isEmailVerified: true,
          isActive: true,
          isOwner: false,
          companyId: otherCompany.id,
        },
        select: { id: true },
      });
      harness.registerUser(otherUser.id);
      const foreign = await harness.prisma.contact.create({
        data: {
          companyId: otherCompany.id,
          createdById: otherUser.id,
          firstName: 'Foreign',
          lastName: `Foreign-${harness.runId}`,
          phone: '+201000000003',
        },
        select: { id: true },
      });
      harness.registerContact(foreign.id);

      const detail = await get(actor, `/contacts/${foreign.id}`);
      expect(detail.status).toBe(404);

      const list = await get(actor, '/contacts');
      expect(list.status).toBe(200);
      const ids = (list.body as { data: Array<{ id: string }> }).data.map(
        (c) => c.id,
      );
      expect(ids).not.toContain(foreign.id);
    });
  });

  // -------------------------------------------------------------------- D3

  describe('D3 — deactivated accounts lose access immediately', () => {
    it('rejects a still-valid access token with 401 right after deactivation, and accepts it again on reactivation', async () => {
      const actor = await createUser('d3-deactivate', { roleId: readRoleId });
      const token = tokenFor(actor);
      const withToken = (path: string) =>
        request(httpServer)
          .get(path)
          .set('Cookie', [`${ACCESS_COOKIE}=${token}`]);

      expect((await withToken('/contacts')).status).toBe(200);
      expect((await withToken('/auth/me')).status).toBe(200);

      await harness.prisma.user.update({
        where: { id: actor.id },
        data: { isActive: false },
      });

      const denied = await withToken('/contacts');
      expect(denied.status).toBe(401);
      expect((await withToken('/auth/me')).status).toBe(401);
      expect((await withToken('/deals')).status).toBe(401);

      await harness.prisma.user.update({
        where: { id: actor.id },
        data: { isActive: true },
      });

      expect((await withToken('/contacts')).status).toBe(200);
    });

    it('rejects a soft-deleted user with the same 401', async () => {
      const actor = await createUser('d3-deleted', { roleId: readRoleId });
      expect((await get(actor, '/contacts')).status).toBe(200);

      await harness.prisma.user.update({
        where: { id: actor.id },
        data: { deletedAt: new Date() },
      });

      expect((await get(actor, '/contacts')).status).toBe(401);
    });

    it('rejects a token whose user no longer exists, with the same body as a deactivated user', async () => {
      const inactive = await createUser('d3-same-body', {
        roleId: readRoleId,
        isActive: false,
      });
      const ghost: Actor = {
        id: 'clghost00000000000000000',
        email: 'ghost@example.com',
        isOwner: false,
        companyId,
      };

      const a = await get(inactive, '/contacts');
      const b = await get(ghost, '/contacts');

      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect((a.body as { message: string }).message).toBe(
        (b.body as { message: string }).message,
      );
    });

    it('keeps an active, valid session working (no regression for normal users)', async () => {
      const actor = await createUser('d3-active', { roleId: readRoleId });

      const first = await get(actor, '/contacts');
      const second = await get(actor, '/contacts');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });
  });
});
