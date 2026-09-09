import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { IJwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

import {
  PERMISSIONS_METADATA_KEY,
  RequiredPermission,
} from './permissions.decorator';

type AuthenticatedRequest = Request & { user: IJwtPayload };

/**
 * Enforces @RequirePermissions() against the caller's assigned Role,
 * using the existing Role / Permission / RolePermission schema
 * (schema.prisma) — not a parallel authorization system.
 *
 * ROLLOUT COMPATIBILITY SHIM — READ BEFORE TOUCHING
 * ---------------------------------------------------
 * This schema has existed with a complete data model but zero
 * enforcement and zero role-assignment UI, so every user in this system
 * has roleId: null today. Hard-requiring a permission the instant this
 * guard shipped would lock out every existing non-owner user with no
 * self-service way to recover (granting a role is itself owner-only —
 * see RoleController). `isLegacyUnrestrictedUser()` below is that
 * compatibility shim, and ONLY that: it is not a permission, it is not
 * a role, and it is not meant to be a permanent bypass. It exists
 * solely so a user who has never been assigned a role keeps today's
 * access until an owner deliberately assigns one. The moment ANY role
 * is assigned to a user, this path no longer applies to them and full
 * enforcement (isRoleAuthorized()) takes over. There is no bypass once
 * a role is assigned, including for permissions that role doesn't have.
 *
 * Every hit of the compatibility path is logged at `debug` (not
 * `warn`/`log`, since with zero roles assigned yet this fires on
 * essentially every non-owner request — it is meant to be queryable
 * when checking rollout progress, not noise in production logs by
 * default) so RBAC adoption is observable: as an operator, if you want
 * to confirm the shim is no longer load-bearing, enable debug logging
 * for this class and confirm nothing logs.
 *
 * Full decision order:
 *   1. Owner → always passes (matches OwnerGuard's existing
 *      convention: owners are fully trusted within their own tenant).
 *   2. Non-owner, no role assigned → isLegacyUnrestrictedUser() —
 *      compatibility shim, logged, passes.
 *   3. Non-owner, role assigned → isRoleAuthorized() — real
 *      enforcement against that role's granted permissions.
 *   4. roleId set but no longer resolves to a live Role → fails
 *      closed (denied), never falls back to (2). See
 *      RoleRepository.softDelete for the normal cleanup path that
 *      avoids this case entirely.
 *
 * Always re-reads the DB rather than trusting the JWT, so a permission
 * change (or role reassignment) takes effect on the very next request —
 * unlike isOwner/companyId, there is no stale-token window bounded by
 * access-token TTL — at the cost of one extra query, and only on routes
 * that opt into this guard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredPermission[] | undefined
    >(PERMISSIONS_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const jwtUser = request.user;

    if (!jwtUser) {
      throw new ForbiddenException('Authentication context is missing.');
    }

    if (jwtUser.isOwner) {
      return true;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: jwtUser.sub,
        companyId: jwtUser.companyId,
        deletedAt: null,
      },
      select: { roleId: true },
    });

    if (!user) {
      throw new ForbiddenException('Authentication context is invalid.');
    }

    if (!user.roleId) {
      return this.isLegacyUnrestrictedUser(jwtUser, required);
    }

    return this.isRoleAuthorized(jwtUser, user.roleId, required);
  }

  /**
   * TEMPORARY COMPATIBILITY PATH — not enforcement. See class comment.
   * Grants access purely because no role has ever been assigned to this
   * user, regardless of what permission was required. Every call is
   * logged so this remaining as load-bearing traffic is visible rather
   * than silent.
   */
  private isLegacyUnrestrictedUser(
    jwtUser: IJwtPayload,
    required: RequiredPermission[],
  ): boolean {
    this.logger.debug(
      `RBAC compatibility fallback used: user=${jwtUser.sub} company=${jwtUser.companyId} ` +
        `required=[${required.map((p) => `${p.resource}:${p.action}`).join(', ')}] ` +
        `reason=no-role-assigned`,
    );

    return true;
  }

  /**
   * REAL ENFORCEMENT. Only reached once a role has actually been
   * assigned to this user — the compatibility shim above no longer
   * applies to them at all from this point on.
   */
  private async isRoleAuthorized(
    jwtUser: IJwtPayload,
    roleId: string,
    required: RequiredPermission[],
  ): Promise<boolean> {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        companyId: jwtUser.companyId,
        deletedAt: null,
      },
      select: {
        rolePermissions: {
          select: {
            permission: { select: { resource: true, action: true } },
          },
        },
      },
    });

    if (!role) {
      // Dangling roleId (should be rare — see RoleRepository.softDelete).
      // Fails closed: never silently falls back to the legacy path.
      throw new ForbiddenException('Assigned role no longer exists.');
    }

    const granted = new Set(
      role.rolePermissions.map(
        (rp) => `${rp.permission.resource}:${rp.permission.action}`,
      ),
    );

    const hasAll = required.every((permission) =>
      granted.has(`${permission.resource}:${permission.action}`),
    );

    if (!hasAll) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
