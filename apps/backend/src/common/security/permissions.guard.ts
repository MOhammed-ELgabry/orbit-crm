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
 * ROLE-LESS USERS (roleId: null) — READ-ONLY POLICY (decision D2)
 * ---------------------------------------------------------------
 * A non-owner with no role assigned used to be treated as fully
 * unrestricted (a rollout shim from before roles had any enforcement).
 * That is no longer the case: such a user is now READ-ONLY on the CRM
 * resource routes this guard protects. They pass only when EVERY
 * permission the route declares has the action "read"; any create /
 * update / delete (or any other action) is denied with the same 403 a
 * role without that permission gets.
 *
 * Why this matters beyond legacy rows: RoleRepository.softDelete sets
 * roleId = null on every holder of a deleted role, and an owner can
 * assign roleId = null explicitly. Under the old shim both silently
 * ESCALATED the user to full access; under this policy they degrade to
 * read-only instead, so deleting a role can never grant permissions.
 *
 * Scope: only routes that opt into this guard (the CRM resources:
 * contact, lead, deal, task, activity, calendar). Self-service account
 * settings (language, appearance, notification preferences, own profile)
 * do not use this guard and are unaffected. Owners are unaffected.
 *
 * Every hit of the role-less path is logged at `debug` so the remaining
 * role-less population stays observable.
 *
 * Full decision order:
 *   1. Owner → always passes (matches OwnerGuard's existing
 *      convention: owners are fully trusted within their own tenant).
 *   2. Non-owner, no role assigned → read-only policy (see above):
 *      passes only for "read" permissions.
 *   3. Non-owner, role assigned → isRoleAuthorized() — real
 *      enforcement against that role's granted permissions.
 *   4. roleId set but no longer resolves to a live Role → fails
 *      closed (denied), never falls back to (2).
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
      return this.isRoleLessReadOnlyAllowed(jwtUser, required);
    }

    return this.isRoleAuthorized(jwtUser, user.roleId, required);
  }

  /**
   * READ-ONLY POLICY for a non-owner with no role assigned (decision D2).
   * Allows the request only when every required permission is a "read";
   * otherwise denies with the standard 403. Never grants create / update
   * / delete, and never consults any role. Logged at `debug`.
   */
  private isRoleLessReadOnlyAllowed(
    jwtUser: IJwtPayload,
    required: RequiredPermission[],
  ): boolean {
    const readOnly = required.every(
      (permission) => permission.action === 'read',
    );

    this.logger.debug(
      `RBAC role-less read-only policy: user=${jwtUser.sub} company=${jwtUser.companyId} ` +
        `required=[${required.map((p) => `${p.resource}:${p.action}`).join(', ')}] ` +
        `result=${readOnly ? 'allowed' : 'denied'}`,
    );

    if (!readOnly) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }

  /**
   * REAL ENFORCEMENT. Only reached once a role has actually been
   * assigned to this user — the role-less read-only policy above no
   * longer applies to them at all from this point on.
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
      // Fails closed: never silently falls back to the role-less path.
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
