import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { IJwtPayload } from '../interfaces/jwt-payload.interface';
import { AUTH_COOKIE_NAMES } from '../utils/cookie-options.util';

/**
 * Cookie-first, Bearer-header-fallback. Browser traffic authenticates via
 * the HttpOnly access-token cookie set by AuthController; the
 * Authorization header remains supported so Swagger UI's "Authorize"
 * button and any future non-browser client keep working unchanged.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const payload = this.jwtService.verify<IJwtPayload>(token);

      (request as Request & { user: IJwtPayload }).user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
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
