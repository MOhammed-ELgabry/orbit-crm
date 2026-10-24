import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';

import {
  AUDIT_SCOPE_REQUEST_KEY,
  createVerifiedAuditScope,
  type AuditScope,
} from './audit-scope';

type AuditRequest = Request & {
  user?: IJwtPayload;
  [AUDIT_SCOPE_REQUEST_KEY]?: AuditScope;
};

const FORBIDDEN_MESSAGE = 'Owner privileges are required for this operation.';

/**
 * Owner-only gate for every audit-log read, verified against the DATABASE on
 * every request. Runs AFTER JwtAuthGuard and OwnerGuard and does NOT replace or
 * change either; it exists because both trust the JWT's isOwner/companyId
 * claims, which can be stale.
 *
 * Passes only when, per the database row:
 *   - the user exists, is not deleted and is active;
 *   - user.isOwner is true (the existing, only definition of "Owner");
 *   - the user belongs to a company, and that company equals the token's
 *     companyId claim (a mismatch is refused, never silently corrected);
 *   - the company is not deleted and is active (same rule the chat module uses).
 *
 * On success it attaches an AuditScope built from the DATABASE values — the
 * only companyId the audit read API will ever use.
 *
 * Uniform failure bodies: 401 for a missing/inactive account (same text as
 * JwtAuthGuard), 403 for everything else (same text as OwnerGuard). A database
 * error propagates (fail closed).
 */
@Injectable()
export class AuditOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    const jwtUser = request.user;

    if (!jwtUser?.sub) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const user = await this.prisma.user.findFirst({
      where: { id: jwtUser.sub, deletedAt: null },
      select: {
        id: true,
        isOwner: true,
        isActive: true,
        companyId: true,
        company: {
          select: { id: true, isActive: true, deletedAt: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (
      !user.isOwner ||
      !user.companyId ||
      !user.company ||
      user.company.id !== user.companyId ||
      user.companyId !== jwtUser.companyId ||
      user.company.deletedAt !== null ||
      !user.company.isActive
    ) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    request[AUDIT_SCOPE_REQUEST_KEY] = createVerifiedAuditScope(
      user.id,
      user.companyId,
    );

    return true;
  }
}
