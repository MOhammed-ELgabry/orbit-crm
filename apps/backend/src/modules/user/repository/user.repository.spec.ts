import { ConflictException } from '@nestjs/common';

import { UserRepository } from './user.repository';
import type { CreateUserRepositoryDto } from '../dto/create-user-repository.dto';

/**
 * This codebase has no other repository-level unit tests anywhere —
 * repositories are normally exercised indirectly through service-level
 * tests against a mocked IUserRepository. This one file is a deliberate
 * exception: the EMPLOYEE-role resolution added to
 * createWithinCompanyLimit lives entirely inside this method (by
 * design — see its doc comment for why it can't be delegated to
 * RoleService without breaking transactional atomicity), so there is
 * no service-layer seam that can observe or verify it. Scoped
 * narrowly to just this one method, not a general repository-testing
 * pattern for the rest of the file.
 */
describe('UserRepository.createWithinCompanyLimit', () => {
  const companyId = 'company-1';
  const employeeRoleId = 'role-employee-1';

  const baseData: CreateUserRepositoryDto = {
    firstName: 'New',
    lastName: 'Member',
    email: 'member@example.com',
    passwordHash: 'hashed-password',
    phone: null,
    avatar: null,
    companyId,
    isOwner: false,
    isActive: true,
    isEmailVerified: true,
  };

  function makeMocks(overrides?: {
    userCount?: number;
    employeeRole?: { id: string; deletedAt: Date | null } | null;
  }) {
    const employeeRole =
      overrides?.employeeRole !== undefined
        ? overrides.employeeRole
        : { id: employeeRoleId, deletedAt: null };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      user: {
        count: jest.fn().mockResolvedValue(overrides?.userCount ?? 0),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'new-user', ...data }),
          ),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue(employeeRole),
      },
    };

    // this.prisma.$transaction(cb) is mocked to actually invoke the
    // callback with the mocked tx above, mirroring how Prisma's real
    // interactive transactions work.
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (transactionClient: typeof tx) => unknown) => callback(tx),
        ),
    };

    const repository = new UserRepository(prisma as never);

    return { repository, prisma, tx };
  }

  it("resolves the company's EMPLOYEE role and sets it as roleId on the created user", async () => {
    const { repository, tx } = makeMocks();

    await repository.createWithinCompanyLimit(baseData, 6);

    expect(tx.role.findUnique).toHaveBeenCalledWith({
      where: { companyId_name: { companyId, name: 'EMPLOYEE' } },
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roleId: employeeRoleId }),
    });
  });

  it('never resolves EMPLOYEE by name alone — always scoped by companyId together with the name, via the compound key', async () => {
    const { repository, tx } = makeMocks();

    await repository.createWithinCompanyLimit(baseData, 6);

    const [[callArgs]] = tx.role.findUnique.mock.calls as [
      [{ where: { companyId_name: { companyId: string; name: string } } }],
    ];

    // The only identifying condition passed is the compound key itself
    // — there is no separate top-level `name` filter that could ever
    // be satisfied without also matching companyId.
    expect(Object.keys(callArgs.where)).toEqual(['companyId_name']);
    expect(callArgs.where.companyId_name).toEqual({
      companyId,
      name: 'EMPLOYEE',
    });
  });

  it('fails closed — throws and never creates the user — when the company has no EMPLOYEE role', async () => {
    const { repository, tx } = makeMocks({ employeeRole: null });

    await expect(
      repository.createWithinCompanyLimit(baseData, 6),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('fails closed when the EMPLOYEE role exists but has been soft-deleted', async () => {
    const { repository, tx } = makeMocks({
      employeeRole: { id: employeeRoleId, deletedAt: new Date() },
    });

    await expect(
      repository.createWithinCompanyLimit(baseData, 6),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('still enforces the 6-user limit first, before ever looking up the EMPLOYEE role', async () => {
    const { repository, tx } = makeMocks({ userCount: 6 });

    await expect(
      repository.createWithinCompanyLimit(baseData, 6),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.role.findUnique).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('acquires the advisory lock before counting users or resolving the role', async () => {
    const { repository, tx } = makeMocks();

    await repository.createWithinCompanyLimit(baseData, 6);

    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const countOrder = tx.user.count.mock.invocationCallOrder[0];
    const roleOrder = tx.role.findUnique.mock.invocationCallOrder[0];

    expect(lockOrder).toBeLessThan(countOrder);
    expect(countOrder).toBeLessThan(roleOrder);
  });

  it('runs the whole sequence inside exactly one transaction (no nested $transaction calls)', async () => {
    const { repository, prisma } = makeMocks();

    await repository.createWithinCompanyLimit(baseData, 6);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
