import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { IJwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

import { PermissionsGuard } from './permissions.guard';
import { RequiredPermission } from './permissions.decorator';

/**
 * Exercises the full PermissionsGuard decision order end-to-end at the
 * unit level (Reflector + PrismaService mocked, everything else real):
 *
 *   1. No @RequirePermissions() on the route -> always allowed.
 *   2. isOwner -> always allowed, no DB lookups at all.
 *   3. Non-owner, roleId: null -> the TEMPORARY compatibility shim
 *      allows it. This is the one case a future removal of the shim is
 *      expected to change; every other case in this file describes
 *      permanent behavior.
 *   4. Non-owner, role assigned, role HAS the permission -> allowed.
 *   5. Non-owner, role assigned, role LACKS the permission -> denied.
 *   6. roleId set but the Role no longer resolves (deleted / wrong
 *      tenant) -> denied, and must NOT fall back to case 3.
 */
describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Reflector>;
  let prisma: {
    user: { findFirst: jest.Mock };
    role: { findFirst: jest.Mock };
  };

  const companyId = 'company-1';
  const contactCreate: RequiredPermission = {
    resource: 'contact',
    action: 'create',
  };

  const buildContext = (jwtUser: IJwtPayload | undefined): ExecutionContext => {
    const request = { user: jwtUser };

    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    prisma = {
      user: { findFirst: jest.fn() },
      role: { findFirst: jest.fn() },
    };

    guard = new PermissionsGuard(reflector, prisma as unknown as PrismaService);
  });

  it('allows the request when the route declares no required permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const allowed = await guard.canActivate(buildContext(undefined));

    expect(allowed).toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('always allows an owner, with zero DB lookups', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);

    const allowed = await guard.canActivate(
      buildContext({
        sub: 'owner-1',
        companyId,
        email: 'owner@test.com',
        isOwner: true,
      } as IJwtPayload),
    );

    expect(allowed).toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('[TEMPORARY SHIM] allows a non-owner with no role assigned', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);
    prisma.user.findFirst.mockResolvedValue({ roleId: null });

    const allowed = await guard.canActivate(
      buildContext({
        sub: 'user-1',
        companyId,
        email: 'user@test.com',
        isOwner: false,
      } as IJwtPayload),
    );

    expect(allowed).toBe(true);
    // This is the ONE case backed by the compatibility shim, not real
    // enforcement — it must never reach a Role lookup, since there's no
    // role to look up.
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('allows a non-owner whose assigned role HAS the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);
    prisma.user.findFirst.mockResolvedValue({ roleId: 'role-1' });
    prisma.role.findFirst.mockResolvedValue({
      rolePermissions: [
        { permission: { resource: 'contact', action: 'create' } },
        { permission: { resource: 'contact', action: 'read' } },
      ],
    });

    const allowed = await guard.canActivate(
      buildContext({
        sub: 'user-1',
        companyId,
        email: 'user@test.com',
        isOwner: false,
      } as IJwtPayload),
    );

    expect(allowed).toBe(true);
    expect(prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'role-1', companyId }),
      }),
    );
  });

  it('denies a non-owner whose assigned role LACKS the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);
    prisma.user.findFirst.mockResolvedValue({ roleId: 'role-read-only' });
    prisma.role.findFirst.mockResolvedValue({
      rolePermissions: [
        { permission: { resource: 'contact', action: 'read' } },
      ],
    });

    await expect(
      guard.canActivate(
        buildContext({
          sub: 'user-1',
          companyId,
          email: 'user@test.com',
          isOwner: false,
        } as IJwtPayload),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires ALL declared permissions, not just one, when multiple are declared', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      contactCreate,
      { resource: 'contact', action: 'delete' },
    ]);
    prisma.user.findFirst.mockResolvedValue({ roleId: 'role-partial' });
    prisma.role.findFirst.mockResolvedValue({
      rolePermissions: [
        { permission: { resource: 'contact', action: 'create' } },
        // missing contact:delete
      ],
    });

    await expect(
      guard.canActivate(
        buildContext({
          sub: 'user-1',
          companyId,
          email: 'user@test.com',
          isOwner: false,
        } as IJwtPayload),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails CLOSED (denied) when roleId is set but the Role no longer resolves, never falling back to the shim', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);
    prisma.user.findFirst.mockResolvedValue({ roleId: 'deleted-role' });
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        buildContext({
          sub: 'user-1',
          companyId,
          email: 'user@test.com',
          isOwner: false,
        } as IJwtPayload),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the role lookup to the caller’s own company (defense in depth against a cross-tenant roleId)', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);
    prisma.user.findFirst.mockResolvedValue({ roleId: 'role-from-elsewhere' });
    // Simulates the role existing, but not in this company — the
    // companyId filter in the real query is what would make Prisma
    // return null here; we assert the guard queried with that filter.
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        buildContext({
          sub: 'user-1',
          companyId,
          email: 'user@test.com',
          isOwner: false,
        } as IJwtPayload),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'role-from-elsewhere',
          companyId,
          deletedAt: null,
        }),
      }),
    );
  });

  it('denies when there is no authentication context at all', async () => {
    reflector.getAllAndOverride.mockReturnValue([contactCreate]);

    await expect(
      guard.canActivate(buildContext(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
