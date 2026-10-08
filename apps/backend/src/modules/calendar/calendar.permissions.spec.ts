import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { DEFAULT_ROLE_DEFINITIONS } from '../role/constants/default-roles.constants';

import { CalendarController } from './calendar.controller';

/**
 * permissions.guard.spec.ts already proves PermissionsGuard's decision
 * logic in the abstract (owner bypass, the legacy no-role shim, role-
 * has-the-permission, role-lacks-it, dangling roleId). This file proves
 * something that generic spec cannot: that the REAL CalendarController
 * actually carries the RIGHT @RequirePermissions metadata on the right
 * routes, and that the REAL, currently-shipped DEFAULT_ROLE_DEFINITIONS
 * produces exactly the approved MANAGER/SALES/SUPPORT/EMPLOYEE/OWNER
 * matrix when run through the real guard. If a future edit to either
 * file drifts from the approved matrix, this test — not just the
 * generic guard spec — is what catches it.
 */
describe('Calendar permission matrix (real guard + real controller metadata + real DEFAULT_ROLE_DEFINITIONS)', () => {
  let guard: PermissionsGuard;
  let prisma: {
    user: { findFirst: jest.Mock };
    role: { findFirst: jest.Mock };
  };

  const companyId = 'company-1';

  function jwt(overrides: Partial<IJwtPayload> = {}): IJwtPayload {
    return {
      sub: 'user-1',
      companyId,
      isOwner: false,
      ...overrides,
    } as IJwtPayload;
  }

  function buildContext(
    jwtUser: IJwtPayload | undefined,
    handler: (...args: never[]) => unknown,
  ): ExecutionContext {
    const request = { user: jwtUser };

    return {
      getHandler: () => handler,
      getClass: () => CalendarController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  /** A role whose granted permissions are exactly DEFAULT_ROLE_DEFINITIONS' entry for `roleName`. */
  function mockRoleFrom(
    roleName: string,
    roleId = `role-${roleName.toLowerCase()}`,
  ) {
    const definition = DEFAULT_ROLE_DEFINITIONS.find(
      (r) => r.name === roleName,
    );
    if (!definition) {
      throw new Error(
        `No DEFAULT_ROLE_DEFINITIONS entry for ${roleName} — fixture is out of date.`,
      );
    }

    prisma.user.findFirst.mockResolvedValue({ roleId });
    prisma.role.findFirst.mockResolvedValue({
      rolePermissions: definition.permissions.map((p) => ({
        permission: { resource: p.resource, action: p.action },
      })),
    });
  }

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      role: { findFirst: jest.fn() },
    };

    guard = new PermissionsGuard(
      new Reflector(),
      prisma as unknown as PrismaService,
    );
  });

  const routes: Array<{
    label: string;
    handler: (...args: never[]) => unknown;
  }> = [
    {
      label: 'POST /calendar (create)',
      handler: CalendarController.prototype.create,
    },
    {
      label: 'GET /calendar (findAll)',
      handler: CalendarController.prototype.findAll,
    },
    {
      label: 'GET /calendar/:id (findById)',
      handler: CalendarController.prototype.findById,
    },
    {
      label: 'PATCH /calendar/:id (update)',
      handler: CalendarController.prototype.update,
    },
    {
      label: 'DELETE /calendar/:id (remove)',
      handler: CalendarController.prototype.remove,
    },
  ];

  describe('route metadata', () => {
    it.each(routes)(
      '$label carries exactly one calendar permission requirement',
      async ({ handler }) => {
        const reflector = new Reflector();
        const required = reflector.getAllAndOverride('requiredPermissions', [
          handler,
          CalendarController,
        ]);
        expect(required).toHaveLength(1);
        expect(required[0].resource).toBe('calendar');
      },
    );

    it('GET routes require calendar:read — a deliberate difference from Contact/Lead/Deal/Task\u2019s own unguarded GETs', () => {
      const reflector = new Reflector();
      for (const handler of [
        CalendarController.prototype.findAll,
        CalendarController.prototype.findById,
      ]) {
        const required = reflector.getAllAndOverride('requiredPermissions', [
          handler,
          CalendarController,
        ]);
        expect(required[0].action).toBe('read');
      }
    });

    it('POST/PATCH/DELETE require create/update/delete respectively', () => {
      const reflector = new Reflector();
      const expected: Record<string, string> = {
        create: 'create',
        update: 'update',
        remove: 'delete',
      };
      for (const [method, action] of Object.entries(expected)) {
        const handler = (
          CalendarController.prototype as unknown as Record<
            string,
            (...args: never[]) => unknown
          >
        )[method];
        const required = reflector.getAllAndOverride('requiredPermissions', [
          handler,
          CalendarController,
        ]);
        expect(required[0].action).toBe(action);
      }
    });
  });

  describe('the deployed matrix', () => {
    const matrix: Record<
      string,
      Record<'create' | 'findAll' | 'findById' | 'update' | 'remove', boolean>
    > = {
      MANAGER: {
        create: true,
        findAll: true,
        findById: true,
        update: true,
        remove: true,
      },
      SALES: {
        create: true,
        findAll: true,
        findById: true,
        update: true,
        remove: false,
      },
      SUPPORT: {
        create: true,
        findAll: true,
        findById: true,
        update: true,
        remove: false,
      },
      EMPLOYEE: {
        create: false,
        findAll: true,
        findById: true,
        update: false,
        remove: false,
      },
    };

    for (const [roleName, expectations] of Object.entries(matrix)) {
      describe(roleName, () => {
        for (const route of routes) {
          const key = route.handler.name as keyof typeof expectations;
          const shouldAllow = expectations[key];

          it(`${shouldAllow ? 'allows' : 'denies'} ${route.label}`, async () => {
            mockRoleFrom(roleName);
            const context = buildContext(jwt(), route.handler);

            if (shouldAllow) {
              await expect(guard.canActivate(context)).resolves.toBe(true);
            } else {
              await expect(guard.canActivate(context)).rejects.toThrow(
                ForbiddenException,
              );
            }
          });
        }
      });
    }
  });

  it('OWNER bypasses every calendar route without any DB lookup', async () => {
    for (const route of routes) {
      const context = buildContext(jwt({ isOwner: true }), route.handler);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('a non-owner with no role assigned falls through the existing legacy compatibility shim (unchanged behavior, not Calendar-specific)', async () => {
    prisma.user.findFirst.mockResolvedValue({ roleId: null });
    const context = buildContext(jwt(), CalendarController.prototype.remove);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('a role assigned but missing calendar:read entirely (e.g. a custom role never given Calendar access) is denied on GET, not silently allowed', async () => {
    prisma.user.findFirst.mockResolvedValue({ roleId: 'role-custom' });
    prisma.role.findFirst.mockResolvedValue({ rolePermissions: [] });
    const context = buildContext(jwt(), CalendarController.prototype.findAll);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
