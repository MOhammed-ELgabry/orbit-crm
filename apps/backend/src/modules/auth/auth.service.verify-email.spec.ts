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
 * own claim/company-creation behavior; role-seeding itself is covered
 * separately by ensure-default-roles.util.spec.ts.
 */
const mockPermissions = [
  { id: 'perm-contact-create', resource: 'contact', action: 'create' },
  { id: 'perm-contact-read', resource: 'contact', action: 'read' },
  { id: 'perm-contact-update', resource: 'contact', action: 'update' },
  { id: 'perm-contact-delete', resource: 'contact', action: 'delete' },
  { id: 'perm-activity-create', resource: 'activity', action: 'create' },
  { id: 'perm-activity-read', resource: 'activity', action: 'read' },
  { id: 'perm-activity-update', resource: 'activity', action: 'update' },
  { id: 'perm-activity-delete', resource: 'activity', action: 'delete' },
];

function mockRoleAndPermission() {
  return {
    permission: {
      findMany: jest.fn().mockResolvedValue(mockPermissions),
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

  function buildService(txImpl: (cb: (tx: unknown) => unknown) => unknown) {
    const prisma = { $transaction: jest.fn(txImpl) };
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(baseUser),
    };
    const emailVerificationRepository = {
      findByEmail: jest.fn().mockResolvedValue(baseVerification),
    };
    const onboardingTokenRepository = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
    };
    const tokenHashService = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };

    // Constructed directly, positionally, matching AuthService's real
    // constructor order — every dependency verifyEmail()/
    // issueOnboardingToken() don't touch is stubbed with {} and is
    // never called by the code path under test.
    const service = new AuthService(
      prisma as never,
      userRepository as never,
      emailVerificationRepository as never,
      {} as never, // passwordService
      {} as never, // mailService
      {} as never, // authRepository
      {} as never, // authSessionRepository
      {} as never, // passwordResetRepository
      {} as never, // socialAccountRepository
      onboardingTokenRepository as never,
      {} as never, // configService
      tokenHashService as never,
      {} as never, // oauthStateService
      {} as never, // googleAuthProvider
      {} as never, // facebookAuthProvider
      {} as never, // microsoftAuthProvider
      {} as never, // jwtService
    );

    return { service };
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
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      BadRequestException,
    );

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

    const { service } = buildService(txImpl);

    await expect(service.verifyEmail({ email, code })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('creates the company and returns an onboarding token on a normal, uncontested request', async () => {
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

    const { service } = buildService(txImpl);

    const result = await service.verifyEmail({ email, code });

    expect(result.success).toBe(true);
    expect(typeof result.onboardingToken).toBe('string');
    expect(result.onboardingToken.length).toBeGreaterThan(0);

    // Phase 2 RBAC: a newly-created company must get its 4 default
    // roles seeded inside this same transaction — not a separate,
    // unprotected follow-up call.
    expect(roleAndPermissionMocks.role.upsert).toHaveBeenCalledTimes(4);
  });
});
