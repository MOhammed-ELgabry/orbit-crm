import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { AUTH_COOKIE_NAMES } from '../../modules/auth/utils/cookie-options.util';

/**
 * Double-submit-cookie CSRF protection for cookie-authenticated,
 * state-changing requests.
 *
 * Why this is needed even with SameSite=None on the auth cookies:
 * SameSite=None deliberately allows the browser to attach them to
 * cross-site requests (the frontend and API are not guaranteed to be
 * same-site — see cookie-options.util.ts), which removes SameSite's own
 * baseline CSRF protection. This guard restores it: the non-HttpOnly
 * `orbit_csrf_token` cookie is only readable by JavaScript running on our
 * own origin (the browser's same-origin policy blocks a cross-site
 * attacker page from reading it), so only a genuine same-origin request
 * can know the value needed to echo it back in the X-CSRF-Token header.
 * A forged cross-site request carries the cookie automatically but can't
 * produce a matching header.
 *
 * Apply this to state-changing endpoints that rely on the auth cookies
 * for authorization (protected resource mutations, /auth/refresh,
 * /auth/logout). It is deliberately NOT applied to /auth/login,
 * /auth/register, or the email-verification/password-reset endpoints —
 * those either have no session yet or are already protected by a
 * possession-based one-time token/code, which double-submit CSRF isn't
 * the relevant defense for.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const cookieToken = request.cookies?.[AUTH_COOKIE_NAMES.csrfToken] as
      string | undefined;
    const headerToken = request.headers['x-csrf-token'];

    if (
      typeof cookieToken !== 'string' ||
      cookieToken.length === 0 ||
      typeof headerToken !== 'string' ||
      headerToken.length === 0 ||
      cookieToken !== headerToken
    ) {
      throw new ForbiddenException('Invalid or missing CSRF token.');
    }

    return true;
  }
}
