/**
 * Shared bootstrap of the audit integration specs (NOT a spec itself).
 *
 * Boots the real AppModule against the real PostgreSQL test database
 * (`orbitcrm_test` only: the harness proves the database identity, and so does
 * this file for the application's own connection), with the same request
 * pipeline as src/main.ts, and offers small builders:
 *
 *   - companies / users / roles, all marker-named and registered in the
 *     harness ledger immediately (only harness.cleanup() removes them);
 *   - requests authenticated by a token signed with the application's own
 *     JwtService, so claims can be forged on purpose (isOwner, companyId) and
 *     the login throttle is not a factor.
 *
 * Nothing here talks to any database except the validated test database.
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

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const ACCESS_COOKIE = 'orbit_access_token';
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_VALUE = 'audit-it-csrf-value';
const BCRYPT_ROUNDS = 10;

export interface Actor {
  id: string;
  email: string;
  companyId: string;
  isOwner: boolean;
}

export type HttpMethod = 'post' | 'patch' | 'put' | 'delete';

export interface AuditTestContext {
  harness: TestHarness;
  prisma: PrismaService;
  http: Server;
  jwt: JwtService;

  createCompany(label: string): Promise<string>;
  createRole(
    companyId: string,
    label: string,
    permissionKeys: string[],
    exactName?: string,
  ): Promise<string>;
  createUser(
    companyId: string,
    label: string,
    options?: { isOwner?: boolean; roleId?: string | null; isActive?: boolean },
  ): Promise<Actor>;
  permissionId(key: string): string;

  /** Token for `actor`, optionally with forged claims. */
  tokenFor(actor: Actor, claims?: Partial<Actor>): string;
  get(actor: Actor, path: string, claims?: Partial<Actor>): request.Test;
  send(
    method: HttpMethod,
    actor: Actor,
    path: string,
    body?: Record<string, unknown>,
  ): request.Test;

  /** Audit rows of a company, oldest first, straight from the database. */
  auditRows(
    companyId: string,
    where?: Record<string, unknown>,
  ): Promise<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      entityLabel: string | null;
      actorUserId: string | null;
      changes: unknown;
      metadata: unknown;
      correlationId: string | null;
    }>
  >;

  close(): Promise<void>;
}

export async function createAuditTestContext(): Promise<AuditTestContext> {
  const harness = await createTestHarness();
  await harness.assertDatabaseIdentity();

  let app: INestApplication | undefined;

  try {
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

    const prisma = app.get(PrismaService);
    const rows = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    if (rows[0]?.current_database !== 'orbitcrm_test') {
      throw new Error('The application is not connected to orbitcrm_test.');
    }
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('NODE_ENV is not "test".');
    }

    const jwt = app.get(JwtService, { strict: false });
    const http = app.getHttpServer() as Server;

    // READ-ONLY lookup of the shared Permission catalog.
    const catalog = await harness.prisma.permission.findMany({
      select: { id: true, resource: true, action: true },
    });
    const permissionIds = new Map(
      catalog.map((p) => [`${p.resource}:${p.action}`, p.id]),
    );

    const passwordHash = await bcrypt.hash(
      `Orbit-It-${harness.runId}`,
      BCRYPT_ROUNDS,
    );
    let sequence = 0;

    const tokenFor = (actor: Actor, claims: Partial<Actor> = {}): string => {
      const merged = { ...actor, ...claims };
      return jwt.sign({
        sub: merged.id,
        companyId: merged.companyId,
        email: merged.email,
        isOwner: merged.isOwner,
      });
    };

    const cookiesFor = (actor: Actor, claims?: Partial<Actor>) => [
      `${ACCESS_COOKIE}=${tokenFor(actor, claims)}`,
      `${CSRF_COOKIE}=${CSRF_VALUE}`,
    ];

    const context: AuditTestContext = {
      harness,
      prisma,
      http,
      jwt,

      permissionId(key) {
        const id = permissionIds.get(key);
        if (!id) {
          throw new Error(`Permission ${key} is missing in orbitcrm_test.`);
        }
        return id;
      },

      async createCompany(label) {
        sequence += 1;
        const company = await harness.prisma.company.create({
          data: { name: harness.uniqueName(`${label}-${sequence}`) },
          select: { id: true },
        });
        harness.registerCompany(company.id);
        return company.id;
      },

      async createRole(companyId, label, permissionKeys, exactName) {
        sequence += 1;
        const role = await harness.prisma.role.create({
          data: {
            companyId,
            name: exactName ?? harness.uniqueName(`${label}-${sequence}`),
            rolePermissions: {
              createMany: {
                data: permissionKeys.map((key) => ({
                  permissionId: context.permissionId(key),
                })),
              },
            },
          },
          select: { id: true },
        });
        harness.registerRole(role.id);
        return role.id;
      },

      async createUser(companyId, label, options = {}) {
        sequence += 1;
        const email = harness.uniqueEmail(`${label}-${sequence}`);
        const user = await harness.prisma.user.create({
          data: {
            firstName: 'Audit',
            lastName: label,
            email,
            passwordHash,
            isEmailVerified: true,
            isActive: options.isActive ?? true,
            isOwner: options.isOwner ?? false,
            roleId: options.roleId ?? null,
            companyId,
          },
          select: { id: true },
        });
        harness.registerUser(user.id);
        return {
          id: user.id,
          email,
          companyId,
          isOwner: options.isOwner ?? false,
        };
      },

      tokenFor,

      get: (actor, path, claims) =>
        request(http)
          .get(path)
          .set('Cookie', [`${ACCESS_COOKIE}=${tokenFor(actor, claims)}`]),

      send: (method, actor, path, body) => {
        const req = request(http)
          [method](path)
          .set('Cookie', cookiesFor(actor))
          .set(CSRF_HEADER, CSRF_VALUE);
        return body ? req.send(body) : req;
      },

      auditRows: (companyId, where = {}) =>
        harness.prisma.auditLog.findMany({
          where: { companyId, ...where },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            entityLabel: true,
            actorUserId: true,
            changes: true,
            metadata: true,
            correlationId: true,
          },
        }),

      async close() {
        let failure: unknown;

        try {
          await app?.close();
        } catch (error) {
          failure = error;
        }

        try {
          const ids = harness.createdIds();
          await harness.cleanup();

          const [companies, users, audit] = await Promise.all([
            harness.prisma.company.count({
              where: { id: { in: ids.createdCompanyIds } },
            }),
            harness.prisma.user.count({
              where: { id: { in: ids.createdUserIds } },
            }),
            harness.prisma.auditLog.count({
              where: { companyId: { in: ids.createdCompanyIds } },
            }),
          ]);

          if (companies + users + audit > 0) {
            throw new Error(
              `Cleanup left records behind: companies=${companies} users=${users} auditRows=${audit}`,
            );
          }
        } catch (error) {
          failure = failure ?? error;
        } finally {
          await harness.close();
        }

        if (failure) {
          throw failure instanceof Error
            ? failure
            : new Error('Audit test context cleanup failed.', {
                cause: failure,
              });
        }
      },
    };

    return context;
  } catch (error) {
    await app?.close().catch(() => undefined);
    await harness.cleanup().catch(() => undefined);
    await harness.close();
    throw error;
  }
}
