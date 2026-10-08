/**
 * Contacts - RBAC role matrix (integration).
 *
 * Verifies, against the real application and the real PostgreSQL test
 * database (`orbitcrm_test` only), the chain
 *
 *   Role -> RolePermission -> PermissionsGuard -> HTTP authorization
 *
 * for the four default staff roles, using Contacts (the resource with the
 * full create/read/update/delete set):
 *
 *   MANAGER  -> create / read / update / delete
 *   SALES    -> create / read / update
 *   SUPPORT  -> create / read / update
 *   EMPLOYEE -> read only
 *
 * CURRENT production contract this file encodes (src/modules/contact):
 *
 *   POST   /contacts      JwtAuthGuard + PermissionsGuard + CsrfGuard, contact:create -> 201
 *   PATCH  /contacts/:id  JwtAuthGuard + PermissionsGuard + CsrfGuard, contact:update -> 200
 *   DELETE /contacts/:id  JwtAuthGuard + PermissionsGuard + CsrfGuard, contact:delete -> 200 (soft delete)
 *   GET    /contacts      JwtAuthGuard ONLY (no PermissionsGuard)                     -> 200
 *
 * - A denied write is a 403 raised by PermissionsGuard with the message
 *   "You do not have permission to perform this action." (a CSRF failure is
 *   also 403 but has a different message, so asserting the message proves
 *   the denial really came from the permission check).
 * - GET /contacts carries no @RequirePermissions today, so `contact:read` is
 *   not enforced on reads: every authenticated user of the company gets 200.
 *   The GET assertions below document that current contract; they do not
 *   (and cannot) prove that `contact:read` is checked.
 * - Users are `isOwner: false` WITH a real roleId (never the roleId:null
 *   legacy shim). The Roles are real Role rows with real RolePermission rows.
 *
 * Fixtures:
 * - One company. Four roles named and granted exactly like the product's
 *   DEFAULT_ROLE_DEFINITIONS, restricted to the `contact` resource (the
 *   minimum this test needs). The expected HTTP results below are written
 *   out by hand, so if the product definitions ever drift from the policy
 *   above, this test fails instead of silently following them.
 * - The global `Permission` table is READ ONLY here: the contact:* rows must
 *   already exist. This test never inserts, updates or deletes Permission
 *   rows (nor touches _prisma_migrations).
 * - Each role's user performs its writes on dedicated contacts, so tests do
 *   not depend on each other.
 *
 * Every created Company / Role / User / Contact is registered in the harness
 * ledger as soon as its id is known. RolePermission rows have no id of their
 * own: the harness deletes them by the registered Role ids. Sessions created
 * by the logins are discovered by the harness through their userId.
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
import { DEFAULT_ROLE_DEFINITIONS } from '../../../src/modules/role/constants/default-roles.constants';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const ACCESS_COOKIE = 'orbit_access_token';
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const BCRYPT_ROUNDS = 10; // same cost PasswordService uses
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';

type RoleKey = 'manager' | 'sales' | 'support' | 'employee';

const ROLE_NAME: Record<RoleKey, string> = {
  manager: 'MANAGER',
  sales: 'SALES',
  support: 'SUPPORT',
  employee: 'EMPLOYEE',
};

/** The documented policy, written out by hand (NOT read from the product). */
const EXPECTED_CONTACT_PERMISSIONS: Record<RoleKey, string[]> = {
  manager: [
    'contact:create',
    'contact:delete',
    'contact:read',
    'contact:update',
  ],
  sales: ['contact:create', 'contact:read', 'contact:update'],
  support: ['contact:create', 'contact:read', 'contact:update'],
  employee: ['contact:read'],
};

const ROLE_KEYS = Object.keys(ROLE_NAME) as RoleKey[];

interface ContactBody {
  id: string;
  companyId: string;
  createdById: string;
  firstName: string;
  lastName: string;
}

interface ListBody {
  success: boolean;
  statusCode: number;
  data: ContactBody[];
  meta: { total: number };
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
}

interface LoginBody {
  success: boolean;
  user: { id: string; isOwner: boolean; permissions: string[] };
}

type Agent = ReturnType<typeof request.agent>;

/** One logged-in user of one role, with the contacts dedicated to them. */
interface Actor {
  key: RoleKey;
  userId: string;
  email: string;
  agent: Agent;
  csrf: string;
  /** Seeded contact this actor tries to PATCH. */
  patchTargetId: string;
  /** Seeded contact this actor tries to DELETE. */
  deleteTargetId: string;
}

describe('Contacts RBAC role matrix (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;

  let companyId: string;
  // Seeded, never mutated: lets the GET tests prove real data comes back.
  let readableContactId: string;
  const actors = {} as Record<RoleKey, Actor>;

  // Random per run: never a fixed, committed credential.
  let password: string;

  /** Seeds a contact straight into the DB and registers it immediately. */
  async function seedContact(
    createdById: string,
    label: string,
  ): Promise<string> {
    const contact = await harness.prisma.contact.create({
      data: {
        companyId,
        createdById,
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
  async function loginAs(
    key: RoleKey,
    userId: string,
    email: string,
  ): Promise<Pick<Actor, 'agent' | 'csrf'>> {
    const agent = request.agent(httpServer);

    const res = await agent.post('/auth/login').send({ email, password });

    expect(res.status).toBe(200);

    const setCookie = res.headers['set-cookie'] as unknown as
      string[] | undefined;
    expect(cookieValue(setCookie, ACCESS_COOKIE)).toBeTruthy();

    const csrf = cookieValue(setCookie, CSRF_COOKIE);
    expect(csrf).toBeTruthy();

    const body = res.body as LoginBody;
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(userId);
    // Non-owner with a real role: neither the owner bypass nor the
    // roleId:null shim is in play.
    expect(body.user.isOwner).toBe(false);
    // The real login flow reports the role's grants: RolePermission rows are
    // wired up for this user.
    expect(
      body.user.permissions.filter((p) => p.startsWith('contact:')).sort(),
    ).toEqual(EXPECTED_CONTACT_PERMISSIONS[key]);

    return { agent, csrf: csrf as string };
  }

  /** Full row, straight from the database (includes soft-deleted rows). */
  const rowOf = (id: string) =>
    harness.prisma.contact.findUniqueOrThrow({ where: { id } });

  const countCompanyContacts = () =>
    harness.prisma.contact.count({ where: { companyId } });

  const countByLastName = (lastName: string) =>
    harness.prisma.contact.count({ where: { lastName } });

  // ---------------------------------------------------------- HTTP helpers

  const httpPost = (actor: Actor, body: Record<string, unknown>) =>
    actor.agent.post('/contacts').set(CSRF_HEADER, actor.csrf).send(body);

  const httpPatch = (actor: Actor, id: string, body: Record<string, unknown>) =>
    actor.agent
      .patch(`/contacts/${id}`)
      .set(CSRF_HEADER, actor.csrf)
      .send(body);

  const httpDelete = (actor: Actor, id: string) =>
    actor.agent.delete(`/contacts/${id}`).set(CSRF_HEADER, actor.csrf);

  // ------------------------------------------------------- assertion helpers

  async function expectCanList(actor: Actor): Promise<void> {
    const res = await actor.agent.get('/contacts');
    const body = res.body as ListBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(body.data.map((c) => c.id)).toContain(readableContactId);
    // Single company: everything returned belongs to it.
    expect(body.data.every((c) => c.companyId === companyId)).toBe(true);
  }

  async function expectCanCreate(actor: Actor): Promise<void> {
    const payload = {
      firstName: 'Created',
      lastName: `Created-${actor.key}-${harness.runId}`,
      email: harness.uniqueEmail(`created-${actor.key}`),
    };

    const res = await httpPost(actor, payload);
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
    expect(body.data.companyId).toBe(companyId);

    const row = await rowOf(createdId);
    expect(row.companyId).toBe(companyId);
    expect(row.createdById).toBe(actor.userId);
    expect(row.lastName).toBe(payload.lastName);
    expect(row.deletedAt).toBeNull();
  }

  async function expectCanUpdate(actor: Actor): Promise<void> {
    const before = await rowOf(actor.patchTargetId);

    const res = await httpPatch(actor, actor.patchTargetId, {
      firstName: 'Edited',
      notes: `edited by ${actor.key}`,
    });
    const body = res.body as ItemBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(actor.patchTargetId);

    const after = await rowOf(actor.patchTargetId);
    expect(after.firstName).toBe('Edited');
    expect(after.notes).toBe(`edited by ${actor.key}`);
    expect(after.companyId).toBe(companyId);
    expect(after.lastName).toBe(before.lastName);
    expect(after.deletedAt).toBeNull();
  }

  async function expectCanDelete(actor: Actor): Promise<void> {
    const before = await rowOf(actor.deleteTargetId);
    expect(before.deletedAt).toBeNull();

    const res = await httpDelete(actor, actor.deleteTargetId);
    const body = res.body as ErrorBody;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Existing soft-delete behaviour: the row stays, with deletedAt set.
    const after = await rowOf(actor.deleteTargetId);
    expect(after.deletedAt).not.toBeNull();
    expect(after.companyId).toBe(companyId);
  }

  async function expectCreateDenied(actor: Actor): Promise<void> {
    const companyCountBefore = await countCompanyContacts();
    const lastName = `Denied-${actor.key}-${harness.runId}`;

    const res = await httpPost(actor, { firstName: 'Denied', lastName });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.message).toBe(FORBIDDEN_MESSAGE);

    expect(await countByLastName(lastName)).toBe(0);
    expect(await countCompanyContacts()).toBe(companyCountBefore);
  }

  async function expectUpdateDenied(actor: Actor): Promise<void> {
    const before = await rowOf(actor.patchTargetId);

    const res = await httpPatch(actor, actor.patchTargetId, {
      firstName: 'Denied',
      notes: `denied edit by ${actor.key}`,
    });
    const body = res.body as ErrorBody;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.message).toBe(FORBIDDEN_MESSAGE);

    // Byte-for-byte unchanged, updatedAt included.
    expect(await rowOf(actor.patchTargetId)).toEqual(before);
  }

  async function expectDeleteDenied(actor: Actor): Promise<void> {
    const before = await rowOf(actor.deleteTargetId);
    expect(before.deletedAt).toBeNull();

    const res = await httpDelete(actor, actor.deleteTargetId);
    const body = res.body as ErrorBody;

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.message).toBe(FORBIDDEN_MESSAGE);

    const after = await rowOf(actor.deleteTargetId);
    expect(after.deletedAt).toBeNull();
    expect(after).toEqual(before);
  }

  // ------------------------------------------------------------------ setup

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

    // READ-ONLY lookup of the global Permission rows this test needs. They
    // are shared reference data: this test never creates, edits or deletes
    // them, so if they are missing it stops instead of seeding them.
    const wanted = ['create', 'read', 'update', 'delete'].map(
      (action) => `contact:${action}`,
    );
    const permissionRows = await harness.prisma.permission.findMany({
      where: { resource: 'contact' },
      select: { id: true, resource: true, action: true },
    });
    const permissionIdByKey = new Map(
      permissionRows.map((p) => [`${p.resource}:${p.action}`, p.id]),
    );
    const missing = wanted.filter((key) => !permissionIdByKey.has(key));
    if (missing.length > 0) {
      throw new Error(
        `The global Permission table in orbitcrm_test is missing: ${missing.join(', ')}. ` +
          'This test only READS Permission rows and will not insert them. Populate the ' +
          'permission catalog in orbitcrm_test deliberately (it is shared reference data) ' +
          'and run the test again.',
      );
    }

    password = `Orbit-It-${harness.runId}`;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName('rbac-company') },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    companyId = company.id;

    // Roles + RolePermissions, mirroring DEFAULT_ROLE_DEFINITIONS but only
    // for the `contact` resource. RolePermission rows are created nested with
    // their Role and are removed by the harness through the Role id.
    const roleIdByKey = {} as Record<RoleKey, string>;
    for (const key of ROLE_KEYS) {
      const definition = DEFAULT_ROLE_DEFINITIONS.find(
        (d) => d.name === ROLE_NAME[key],
      );
      if (!definition) {
        throw new Error(
          `DEFAULT_ROLE_DEFINITIONS has no ${ROLE_NAME[key]} role anymore.`,
        );
      }

      const permissionIds = definition.permissions
        .filter((p) => p.resource === 'contact')
        .map((p) => permissionIdByKey.get(`${p.resource}:${p.action}`))
        .filter((id): id is string => typeof id === 'string');

      const role = await harness.prisma.role.create({
        data: {
          companyId,
          name: definition.name,
          description: definition.description,
          isSystemRole: true,
          rolePermissions: {
            createMany: {
              data: permissionIds.map((permissionId) => ({ permissionId })),
            },
          },
        },
        select: { id: true },
      });
      harness.registerRole(role.id);
      roleIdByKey[key] = role.id;
    }

    // One user per role. The manager is created first and is also the
    // creator of every seeded contact.
    const userIdByKey = {} as Record<RoleKey, string>;
    const emailByKey = {} as Record<RoleKey, string>;
    for (const key of ROLE_KEYS) {
      const email = harness.uniqueEmail(`rbac-${key}`);
      const user = await harness.prisma.user.create({
        data: {
          firstName: 'Rbac',
          lastName: ROLE_NAME[key],
          email,
          passwordHash,
          isEmailVerified: true,
          isActive: true,
          isOwner: false,
          companyId,
          roleId: roleIdByKey[key],
        },
        select: { id: true },
      });
      harness.registerUser(user.id);
      userIdByKey[key] = user.id;
      emailByKey[key] = email;
    }

    readableContactId = await seedContact(userIdByKey.manager, 'readable');

    // Dedicated PATCH / DELETE targets per actor, then one real login each
    // (POST /auth/login is throttled to 5 per minute; this makes 4).
    for (const key of ROLE_KEYS) {
      const patchTargetId = await seedContact(
        userIdByKey.manager,
        `${key}-patch`,
      );
      const deleteTargetId = await seedContact(
        userIdByKey.manager,
        `${key}-delete`,
      );
      const session = await loginAs(key, userIdByKey[key], emailByKey[key]);

      actors[key] = {
        key,
        userId: userIdByKey[key],
        email: emailByKey[key],
        ...session,
        patchTargetId,
        deleteTargetId,
      };
    }
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
          `[contacts-rbac] cleanup deleted: ${JSON.stringify(report.deleted)}`,
        );

        // Read-only proof that nothing this test created is left behind.
        const [companies, roles, rolePermissions, users, contacts, sessions] =
          await Promise.all([
            harness.prisma.company.count({
              where: { id: { in: ids.createdCompanyIds } },
            }),
            harness.prisma.role.count({
              where: { id: { in: ids.createdRoleIds } },
            }),
            harness.prisma.rolePermission.count({
              where: { roleId: { in: ids.createdRoleIds } },
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

        if (
          companies + roles + rolePermissions + users + contacts + sessions >
          0
        ) {
          throw new Error(
            `Cleanup left records behind: companies=${companies} roles=${roles} rolePermissions=${rolePermissions} users=${users} contacts=${contacts} sessions=${sessions}`,
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

  // ---------------------------------------------------------------- MANAGER

  describe('MANAGER (create / read / update / delete)', () => {
    it('can create a contact (201)', () => expectCanCreate(actors.manager));
    it('can list contacts (200)', () => expectCanList(actors.manager));
    it('can update a contact (200)', () => expectCanUpdate(actors.manager));
    it('can delete a contact (200, soft delete)', () =>
      expectCanDelete(actors.manager));
  });

  // ------------------------------------------------------------------ SALES

  describe('SALES (create / read / update)', () => {
    it('can create a contact (201)', () => expectCanCreate(actors.sales));
    it('can list contacts (200)', () => expectCanList(actors.sales));
    it('can update a contact (200)', () => expectCanUpdate(actors.sales));
    it('cannot delete a contact (403, deletedAt stays null)', () =>
      expectDeleteDenied(actors.sales));
  });

  // ---------------------------------------------------------------- SUPPORT

  describe('SUPPORT (create / read / update)', () => {
    it('can create a contact (201)', () => expectCanCreate(actors.support));
    it('can list contacts (200)', () => expectCanList(actors.support));
    it('can update a contact (200)', () => expectCanUpdate(actors.support));
    it('cannot delete a contact (403, deletedAt stays null)', () =>
      expectDeleteDenied(actors.support));
  });

  // --------------------------------------------------------------- EMPLOYEE

  describe('EMPLOYEE (read only)', () => {
    it('can list contacts (200)', () => expectCanList(actors.employee));
    it('cannot create a contact (403, nothing created)', () =>
      expectCreateDenied(actors.employee));
    it('cannot update a contact (403, row unchanged)', () =>
      expectUpdateDenied(actors.employee));
    it('cannot delete a contact (403, deletedAt stays null)', () =>
      expectDeleteDenied(actors.employee));
  });
});
