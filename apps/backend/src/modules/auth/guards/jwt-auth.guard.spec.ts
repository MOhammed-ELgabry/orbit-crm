import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IJwtPayload } from '../interfaces/jwt-payload.interface';
import { AUTH_COOKIE_NAMES } from '../utils/cookie-options.util';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Decision D3 — immediate account deactivation.
 *
 * The guard must reject a request whose JWT is perfectly valid but whose
 * account is, in the database, missing / soft-deleted / in another company
 * / inactive, and it must do so with one uniform 401 so the response never
 * reveals which accounts exist.
 */
describe('JwtAuthGuard', () => {
  const payload: IJwtPayload = {
    sub: 'user-1',
    companyId: 'company-1',
    email: 'a@example.com',
    isOwner: false,
  };

  let jwtService: { verify: jest.Mock };
  let findFirst: jest.Mock;
  let guard: JwtAuthGuard;

  const buildContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const cookieRequest = (token = 'good-token') => ({
    cookies: { [AUTH_COOKIE_NAMES.accessToken]: token },
    headers: {},
  });

  beforeEach(() => {
    jwtService = { verify: jest.fn().mockReturnValue(payload) };
    findFirst = jest.fn().mockResolvedValue({ isActive: true });
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      { user: { findFirst } } as unknown as PrismaService,
    );
  });

  it('allows an active user and attaches the verified payload', async () => {
    const request = cookieRequest();

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect((request as { user?: IJwtPayload }).user).toEqual(payload);
  });

  it('looks the user up by id, excluding soft-deleted rows', async () => {
    await guard.canActivate(buildContext(cookieRequest()));

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', deletedAt: null },
      select: { isActive: true },
    });
  });

  it('REJECTS a still-valid token once the account is deactivated', async () => {
    findFirst.mockResolvedValue({ isActive: false });

    await expect(
      guard.canActivate(buildContext(cookieRequest())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user no longer exists (deleted)', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(buildContext(cookieRequest())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not attach req.user when the account is rejected', async () => {
    findFirst.mockResolvedValue({ isActive: false });
    const request = cookieRequest();

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow();

    expect((request as { user?: IJwtPayload }).user).toBeUndefined();
  });

  it('returns the SAME 401 message for inactive, missing and bad-token cases', async () => {
    const messages: string[] = [];

    findFirst.mockResolvedValueOnce({ isActive: false });
    findFirst.mockResolvedValueOnce(null);
    for (let i = 0; i < 2; i += 1) {
      await guard
        .canActivate(buildContext(cookieRequest()))
        .catch((e: UnauthorizedException) => messages.push(e.message));
    }

    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    await guard
      .canActivate(buildContext(cookieRequest()))
      .catch((e: UnauthorizedException) => messages.push(e.message));

    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });

  it('rejects without a DB lookup when no token is supplied', async () => {
    await expect(
      guard.canActivate(buildContext({ cookies: {}, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects an invalid / expired token without a DB lookup', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(
      guard.canActivate(buildContext(cookieRequest('bad'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects a validly signed token without a subject (never an unscoped lookup)', async () => {
    jwtService.verify.mockReturnValue({ ...payload, sub: undefined });
    await expect(
      guard.canActivate(buildContext(cookieRequest())),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    jwtService.verify.mockReturnValue({ ...payload, sub: '' });
    await expect(
      guard.canActivate(buildContext(cookieRequest())),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('still accepts a Bearer header when there is no cookie', async () => {
    const request = {
      cookies: {},
      headers: { authorization: 'Bearer header-token' },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(jwtService.verify).toHaveBeenCalledWith('header-token');
  });

  it('prefers the cookie over the Bearer header', async () => {
    const request = {
      cookies: { [AUTH_COOKIE_NAMES.accessToken]: 'cookie-token' },
      headers: { authorization: 'Bearer header-token' },
    };

    await guard.canActivate(buildContext(request));

    expect(jwtService.verify).toHaveBeenCalledWith('cookie-token');
  });

  it('fails closed (propagates) when the database errors — never allows', async () => {
    findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      guard.canActivate(buildContext(cookieRequest())),
    ).rejects.toThrow('db down');
  });
});
