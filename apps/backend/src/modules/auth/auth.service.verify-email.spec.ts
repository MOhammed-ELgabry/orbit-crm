/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- jest mock call tuples are untyped */
import { BadRequestException } from '@nestjs/common';

import { AuthService } from './auth.service';

/**
 * Regression test for F4 (verifyEmail concurrency / TOCTOU).
 *
 * Before the fix, isEmailVerified was read once before the transaction
 * started; two concurrent requests carrying the same valid code could
 * both pass that check and each create their own Company row.
 *
 * The fix moves the check inside the transaction as a WHERE-guarded
 * `updateMany` (isEmailVerified: false -> true). This test cannot
 * exercise Postgres's actual row locking (that guarantee comes from
 * the database itself, not from application code) — what it verifies
 * is that AuthService correctly acts on whatever Prisma reports: when
 * the claim's `count` is 0, verifyEmail() must reject and must never
 * call `company.create`, and when the claim wins (`count: 1`) it must
 * create exactly one company. The `txImpl` below simulates the two
 * outcomes Postgres's locking produces for two concurrent callers.
 *
 * verifyEmail()'s transaction also seeds the company's 4 default
 * roles (ensureDefaultRolesForCompany — see Phase 2 RBAC), so every
 * tx mock below that reaches company creation needs tx.permission and
 * tx.role too, or that call throws. mockPermissions/mockTx below give
 * a minimal, realistic stand-in — this file still only asserts F4's
 * own claim/company-creation behavior; role-seeding itself (including
 * its Permission-catalog self-heal) is covered separately by
 * ensure-default-roles.util.spec.ts. mockPermissions here mirrors the
 * real PERMISSION_CATALOG's contact/lead/deal/task/calendar/activity
 * entries (the only ones any DEFAULT_ROLE_DEFINITIONS role currently
 * needs) so that ensureDefaultRolesForCompany's real, non-mocked
 * lookup logic finds every permission it looks for and never needs to
 * self-heal here.
 */
const mockPermissions = [
  { id: 'perm-contact-create', resource: 'contact', action: 'create' },
  { id: 'perm-contact-read', resource: 'contact', action: 'read' },
  { id: 'perm-contact-update', resource: 'contact', action: 'update' },
  { id: 'perm-contact-delete', resource: 'contact', action: 'delete' },
  { id: 'perm-lead-create', resource: 'lead', action: 'create' },
  { id: 'perm-lead-read', resource: 'lead', action: 'read' },
  { id: 'perm-lead-update', resource: 'lead', action: 'update' },
  { id: 'perm-lead-delete', resource: 'lead', action: 'delete' },
  { id: 'perm-deal-create', resource: 'deal', action: 'create' },
  { id: 'perm-deal-read', resource: 'deal', action: 'read' },
  { id: 'perm-deal-update', resource: 'deal', action: 'update' },
  { id: 'perm-deal-delete', resource: 'deal', action: 'delete' },
  { id: 'perm-task-create', resource: 'task', action: 'create' },
  { id: 'perm-task-read', resource: 'task', action: 'read' },
  { id: 'perm-task-update', resource: 'task', action: 'update' },
  { id: 'perm-task-delete', resource: 'task', action: 'delete' },
  { id: 'perm-calendar-create', resource: 'calendar', action: 'create' },
  { id: 'perm-calendar-read', resource: 'calendar', action: 'read' },
  { id: 'perm-calendar-update', resource: 'calendar', action: 'update' },
  { id: 'perm-calendar-delete', resource: 'calendar', action: 'delete' },
  { id: 'perm-activity-create', resource: 'activity', action: 'create' },
  { id: 'perm-activity-read', resource: 'activity', action: 'read' },
  { id: 'perm-activity-update', resource: 'activity', action: 'update' },
  { id: 'perm-activity-delete', resource: 'activity', action: 'delete' },
];

function mockRoleAndPermission() {
  return {
    permission: {
      findMany: jest.fn().mockResolvedValue(mockPermissions),
      // Not expected to be called while mockPermissions above is
      // complete — mocked anyway so this stays a realistic stand-in
      // for the real Prisma client shape.
      upsert: jest.fn().mockResolvedValue({ id: 'perm-unexpected-upsert' }),
    },
    role: {
      upsert: jest.fn().mockResolvedValue({ id: 'role-x' }),
    },
  };
}

describe('AuthService.verifyEmail — F4: concurrent verification', () => {
  const email = 'owner@example.com';
  const code = '123456';
  const userId = 'user-1';

  const baseVerification = {
    email,
    code,
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    verifiedAt: null as Date | null,
  };

  const baseUser = {
    id: userId,
    email,
    firstName: 'Test',
    lastName: 'User',
    isEmailVerified: false,
  };

  function buildService(
    txImpl: (cb: (tx: unknown) => unknown) => unknown,
    regional: {
      pendingHints?: unknown;
      companyData?: Record<string, unknown>;
    } = {},
  ) {
    const prisma = {
      $transaction: jest.fn(txImpl),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ regionalHints: regional.pendingHints ?? null }),
      },
    };
    const toCompanyData = jest
      .fn()
      .mockResolvedValue(regional.companyData ?? {});
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(baseUser),
      // Re-read after the transaction commits, for session issuance.
      findById: jest.fn().mockResolvedValue({
        ...baseUser,
        isEmailVerified: true,
        isActive: true,
        isOwner: true,
        companyId: 'company-1',
        roleId: null,
        avatar: null,
        language: 'en',
        backgroundColor: null,
      }),
    };
    const authSessionRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('7d'),
    };
    const tokenHashService = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const jwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt'),
    };
    const emailVerificationRepository = {
      findByEmail: jest.fn().mockResolvedValue(baseVerification),
    };

    // Constructed directly, positionally, matching AuthService's real
    // constructor order — every dependency verifyEmail() doesn't touch
    // is stubbed with {} and is never called by the code path under test.
    const service = new AuthService(
      prisma as never,
      userRepository as never,
      emailVerificationRepository as never,
      {} as never, // passwordService
      {} as never, // mailService
      {} as never, // authRepository
      authSessionRepository as never,
      {} as never, // passwordResetRepository
      {} as never, // socialAccountRepository
      configService as never,
      tokenHashService as never,
      {} as never, // oauthStateService
      {} as never, // googleAuthProvider
      {} as never, // facebookAuthProvider
      {} as never, // microsoftAuthProvider
      jwtService as never,
      {
        capture: jest.fn().mockResolvedValue(null),
        toCompanyData,
        timezoneOf: jest.fn().mockReturnValue(null),
      } as never, // regionalCapture
      { consume: jest.fn().mockResolvedValue(null) } as never, // regionalHandoff
    );

    return { service, authSessionRepository, prisma, toCompanyData };
  }

  it('lets exactly one of two concurrent requests succeed and never creates a second company', async () => {
    let claimed = false;
    const companyCreate = jest.fn().mockResolvedValue({ id: 'company-1' });

    const txImpl = async (cb: (tx: unknown) => unknown) => {
      const tx = {
        user: {
          updateMany: jest.fn().mockImplementation(() => {
            if (claimed) {
              return Promise.resolve({ count: 0 });
            }
            claimed = true;
            return Promise.resolve({ count: 1 });
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        company: { create: companyCreate },
        emailVerification: { update: jest.fn().mockResolvedValue({}) },
        ...mockRoleAndPermission(),
      };

      return cb(tx);
    };

    const { service } = buildService(txImpl);

    const results = await Promise.allSettled([
      service.verifyEmail({ email, code }),
      service.verifyEmail({ email, code }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);

    // The core "no orphan Company" guarantee.
    expect(companyCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects cleanly with no side effects when the claim is already lost (count: 0)', async () => {
    const companyCreate = jest.fn();

    const txImpl = async (cb: (tx: unknown) => unknown) => {
      const tx = {
        user: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn(),
        },
        company: { create: companyCreate },
        emailVerification: { update: jest.fn() },
        ...mockRoleAndPermission(),
      };

      return cb(tx);
    };

    const { service, authSessionRepository } = buildService(txImpl);

    await expect(service.verifyEmail({ email, code })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(companyCreate).not.toHaveBeenCalled();
    // A lost claim must never produce a session.
    expect(authSessionRepository.create).not.toHaveBeenCalled();
  });

  it('creates the company and issues a session on a normal, uncontested request', async () => {
    const roleAndPermissionMocks = mockRoleAndPermission();

    const txImpl = async (cb: (tx: unknown) => unknown) => {
      const tx = {
        user: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
        company: { create: jest.fn().mockResolvedValue({ id: 'company-1' }) },
        emailVerification: { update: jest.fn().mockResolvedValue({}) },
        ...roleAndPermissionMocks,
      };

      return cb(tx);
    };

    const { service, authSessionRepository } = buildService(txImpl);

    const result = await service.verifyEmail({ email, code });

    // The verified user gets a session through the shared issueSession().
    expect(result.accessToken).toBe('signed-jwt');
    expect(result.refreshToken).toBe('signed-jwt');
    expect(result.user.id).toBe(userId);
    expect(result.user.isOwner).toBe(true);
    expect(authSessionRepository.create).toHaveBeenCalledTimes(1);

    // Phase 2 RBAC: a newly-created company must get its 4 default
    // roles seeded inside this same transaction — not a separate,
    // unprotected follow-up call.
    expect(roleAndPermissionMocks.role.upsert).toHaveBeenCalledTimes(4);
  });

  describe('regional hints (International Foundation)', () => {
    const storedHints = { v: 1, timezone: 'Africa/Cairo', capturedAt: 'x' };
    const suggestion = {
      suggestedCountryCode: 'EG',
      suggestedTimezone: 'Africa/Cairo',
      regionalStatus: 'DETECTED',
    };

    function makeTx(overrides: { companyCreate?: jest.Mock } = {}) {
      const tx = {
        user: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
        company: {
          create:
            overrides.companyCreate ??
            jest.fn().mockResolvedValue({ id: 'company-1' }),
        },
        emailVerification: { update: jest.fn().mockResolvedValue({}) },
        ...mockRoleAndPermission(),
      };
      return tx;
    }

    it('transfers the suggestion to the company and clears the temporary hints in the SAME transaction', async () => {
      const tx = makeTx();
      const { service, prisma, toCompanyData } = buildService((cb) => cb(tx), {
        pendingHints: storedHints,
        companyData: suggestion,
      });

      await service.verifyEmail({ email, code });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { regionalHints: true },
      });
      expect(toCompanyData).toHaveBeenCalledWith(storedHints);

      const createArg = tx.company.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArg.data).toMatchObject(suggestion);
      // Nothing is confirmed on behalf of the Owner.
      expect(createArg.data).not.toHaveProperty('countryCode');
      expect(createArg.data).not.toHaveProperty('baseCurrencyCode');
      expect(createArg.data).not.toHaveProperty('regionalConfirmedAt');

      const clearing = tx.user.update.mock.calls.find(
        (c) => 'regionalHints' in (c[0] as { data: object }).data,
      );
      expect(clearing).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('a failed transaction keeps the hints (the clear is part of the rolled-back transaction)', async () => {
      const tx = makeTx({
        companyCreate: jest.fn().mockRejectedValue(new Error('db error')),
      });
      const { service } = buildService((cb) => cb(tx), {
        pendingHints: storedHints,
        companyData: suggestion,
      });

      await expect(service.verifyEmail({ email, code })).rejects.toThrow();

      // The clearing update is only issued AFTER company creation, so it
      // never ran; together with the rollback the hints survive for a retry.
      const clearing = tx.user.update.mock.calls.find(
        (c) => 'regionalHints' in (c[0] as { data: object }).data,
      );
      expect(clearing).toBeUndefined();
    });

    it('registration without hints still works: company created with no regional columns', async () => {
      const tx = makeTx();
      const { service } = buildService((cb) => cb(tx));

      await service.verifyEmail({ email, code });

      const createArg = tx.company.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArg.data).not.toHaveProperty('suggestedCountryCode');
      expect(createArg.data).not.toHaveProperty('regionalStatus');
    });

    it('a failing hint lookup never blocks e-mail verification', async () => {
      const tx = makeTx();
      const built = buildService((cb) => cb(tx));
      built.prisma.user.findUnique.mockRejectedValue(new Error('boom'));

      const result = await built.service.verifyEmail({ email, code });

      expect(result.accessToken).toBe('signed-jwt');
      expect(tx.company.create).toHaveBeenCalledTimes(1);
    });
  });
});
