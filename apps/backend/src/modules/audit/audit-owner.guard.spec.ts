import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';

import { AuditOwnerGuard } from './audit-owner.guard';
import { AUDIT_SCOPE_REQUEST_KEY } from './audit-scope';

interface DbUser {
  id: string;
  isOwner: boolean;
  isActive: boolean;
  companyId: string | null;
  company: { id: string; isActive: boolean; deletedAt: Date | null } | null;
}

const COMPANY = 'company-A';

const dbUser = (overrides: Partial<DbUser> = {}): DbUser => ({
  id: 'user-1',
  isOwner: true,
  isActive: true,
  companyId: COMPANY,
  company: { id: COMPANY, isActive: true, deletedAt: null },
  ...overrides,
});

function setup(
  row: DbUser | null,
  jwt: Record<string, unknown> | undefined = {
    sub: 'user-1',
    companyId: COMPANY,
    isOwner: true,
  },
) {
  const findFirst = jest.fn().mockResolvedValue(row);
  const guard = new AuditOwnerGuard({ user: { findFirst } } as never);
  const request: Record<string, unknown> = { user: jwt };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { guard, request, context, findFirst };
}

/**
 * Unit tests of the DB-verified Owner gate. The database is mocked: these
 * prove the decision logic, NOT the Prisma query against a real database
 * (that is covered by the not-run int-specs).
 */
describe('AuditOwnerGuard', () => {
  it('allows the real Owner and attaches a scope built from DATABASE values', async () => {
    const { guard, request, context } = setup(dbUser());

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request[AUDIT_SCOPE_REQUEST_KEY]).toEqual({
      userId: 'user-1',
      companyId: COMPANY,
    });
  });

  it('looks the user up by the JWT subject only, excluding deleted users', async () => {
    const { guard, context, findFirst } = setup(dbUser());

    await guard.canActivate(context);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1', deletedAt: null } }),
    );
  });

  it('refuses a forged isOwner:true claim when the database says the user is NOT an owner (403)', async () => {
    const { guard, request, context } = setup(dbUser({ isOwner: false }), {
      sub: 'user-1',
      companyId: COMPANY,
      isOwner: true,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request[AUDIT_SCOPE_REQUEST_KEY]).toBeUndefined();
  });

  it('refuses when the JWT companyId claim differs from the database company (403), and never uses the claim', async () => {
    const { guard, request, context } = setup(dbUser(), {
      sub: 'user-1',
      companyId: 'company-B',
      isOwner: true,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request[AUDIT_SCOPE_REQUEST_KEY]).toBeUndefined();
  });

  it('refuses an owner that no longer belongs to any company (403)', async () => {
    const { guard, context } = setup(
      dbUser({ companyId: null, company: null }),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses when the company is soft-deleted (403)', async () => {
    const { guard, context } = setup(
      dbUser({
        company: { id: COMPANY, isActive: true, deletedAt: new Date() },
      }),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses when the company is inactive (403)', async () => {
    const { guard, context } = setup(
      dbUser({
        company: { id: COMPANY, isActive: false, deletedAt: null },
      }),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses a missing / soft-deleted user with 401', async () => {
    const { guard, context } = setup(null);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an inactive owner with 401', async () => {
    const { guard, context } = setup(dbUser({ isActive: false }));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a request with no authenticated user at all (403) without touching the database', async () => {
    const { guard, context, findFirst } = setup(dbUser(), {});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when the database errors (the error propagates, no scope)', async () => {
    const { guard, request, context, findFirst } = setup(dbUser());
    findFirst.mockRejectedValueOnce(new Error('connection lost'));

    await expect(guard.canActivate(context)).rejects.toThrow('connection lost');
    expect(request[AUDIT_SCOPE_REQUEST_KEY]).toBeUndefined();
  });

  it('uses the same generic 403 text as OwnerGuard for every refusal', async () => {
    const { guard, context } = setup(dbUser({ isOwner: false }));

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Owner privileges are required for this operation.',
    );
  });
});
