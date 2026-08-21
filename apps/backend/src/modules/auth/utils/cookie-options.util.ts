import ms from 'ms';
import type { CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';

/**
 * Single source of truth for the auth cookie names and their attributes.
 *
 * Every endpoint that sets or clears an auth cookie (login, refresh,
 * social callback, logout) goes through these builders so the policy
 * (Path/SameSite/Secure/Domain) can never drift between endpoints.
 */
export const AUTH_COOKIE_NAMES = {
  accessToken: 'orbit_access_token',
  refreshToken: 'orbit_refresh_token',
  // Not HttpOnly by design — the frontend must be able to read this one
  // and echo it back in a request header. See CsrfGuard.
  csrfToken: 'orbit_csrf_token',
} as const;

// The refresh cookie is scoped to /auth so it is never sent on ordinary
// API calls — only to the auth endpoints that actually need it
// (refresh, logout). This shrinks its exposure well beyond "HttpOnly".
const REFRESH_COOKIE_PATH = '/auth';

function baseOptions(
  configService: ConfigService,
): Pick<CookieOptions, 'secure' | 'sameSite' | 'domain' | 'httpOnly'> {
  const isProduction = configService.get<boolean>('app.isProduction');
  const domain = configService.get<string | undefined>('cookies.domain');

  return {
    httpOnly: true,
    // SameSite=None because the frontend and API are not guaranteed to be
    // same-site (production frontend is a duckdns.org host; the API may
    // be on a different domain entirely) — Lax would silently stop
    // working if so. None requires Secure, which is why `secure` is only
    // relaxed in non-production (typically plain-HTTP localhost).
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    ...(domain ? { domain } : {}),
  };
}

function toMs(duration: string): number {
  return ms(duration);
}

export function buildAccessTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const accessExpiresIn = configService.getOrThrow<string>(
    'jwt.accessExpiresIn',
  );

  return {
    ...baseOptions(configService),
    path: '/',
    maxAge: toMs(accessExpiresIn),
  };
}

export function buildRefreshTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const refreshExpiresIn = configService.getOrThrow<string>(
    'jwt.refreshExpiresIn',
  );

  return {
    ...baseOptions(configService),
    path: REFRESH_COOKIE_PATH,
    maxAge: toMs(refreshExpiresIn),
  };
}

export function buildCsrfTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const accessExpiresIn = configService.getOrThrow<string>(
    'jwt.accessExpiresIn',
  );

  return {
    ...baseOptions(configService),
    httpOnly: false,
    path: '/',
    maxAge: toMs(accessExpiresIn),
  };
}

/**
 * Options for clearing a cookie must match Path/Domain/SameSite/Secure of
 * the cookie that was set, or the browser treats it as a different cookie
 * and won't remove it. maxAge/expires are irrelevant for a clear.
 */
export function buildClearCookieOptions(
  configService: ConfigService,
  cookie: 'access' | 'refresh' | 'csrf',
): CookieOptions {
  const base = baseOptions(configService);

  if (cookie === 'refresh') {
    return { ...base, path: REFRESH_COOKIE_PATH };
  }

  if (cookie === 'csrf') {
    return { ...base, httpOnly: false, path: '/' };
  }

  return { ...base, path: '/' };
}
