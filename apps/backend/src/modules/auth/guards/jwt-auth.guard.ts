import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IJwtPayload } from '../interfaces/jwt-payload.interface';
import { AUTH_COOKIE_NAMES } from '../utils/cookie-options.util';

/**
 * Cookie-first, Bearer-header-fallback. Browser traffic authenticates via
 * the HttpOnly access-token cookie set by AuthController; the
 * Authorization header remains supported so Swagger UI's "Authorize"
 * button and any future non-browser client keep working unchanged.
 *
 * IMMEDIATE DEACTIVATION (decision D3). Verifying the JWT signature alone
 * proves the token was once issued — not that the account is still
 * allowed in. So after the signature check, every protected request also
 * confirms against the database that the user still exists, is not
 * soft-deleted, and is still active. A disabled (or deleted) user
 * therefore loses access on their very next request, even while their
 * access token has not yet expired.
 *
 * Cost: one primary-key lookup selecting one column per protected
 * request. The token's companyId claim is deliberately NOT compared here:
 * tokens are only ever signed by this server from the user's own row, and
 * every repository query (and PermissionsGuard) already scopes by that
 * claim, so a mismatching claim can only ever see an empty tenant.
 *
 * The failure mode is deliberately uniform: every rejection reason (bad
 * token, missing user, deleted, inactive) yields the same 401 body, so
 * the response never reveals which accounts exist or why one was
 * refused. A database error is NOT swallowed into a
 * 401 or, worse, a pass: it propagates as a 500 (fail closed).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: IJwtPayload;

    try {
      payload = this.jwtService.verify<IJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    // Defence in depth: a validly signed token without a subject is
    // treated as invalid, never as an unscoped ("no filter") lookup.
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    (request as Request & { user: IJwtPayload }).user = payload;

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const cookieToken = request.cookies?.[AUTH_COOKIE_NAMES.accessToken] as
      string | undefined;

    if (cookieToken) {
      return cookieToken;
    }

    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const [type, headerToken] = authorization.split(' ');

    if (type !== 'Bearer' || !headerToken) {
      return undefined;
    }

    return headerToken;
  }
}
