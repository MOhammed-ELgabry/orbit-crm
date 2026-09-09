import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { UserService } from './user.service';
import type { IUserRepository } from './repository/user.repository.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { PasswordService } from './services/password.service';
import { RoleService } from '../role/role.service';
import type { IAuthSessionRepository } from '../auth/repository/auth-session.repository.interface';

/**
 * Regression test for F1 (account-takeover via UserService.update()).
 *
 * Before the fix, update() only checked that the target id belonged to
 * the caller's company — any authenticated company member could target
 * any other user's id (including the owner's) and set a new password
 * for them. The fix requires id === callerId before anything else runs.
 */
describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<IUserRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let roleService: jest.Mocked<RoleService>;
  let authSessionRepository: jest.Mocked<IAuthSessionRepository>;

  const companyId = 'company-1';
  const callerId = 'user-caller';
  const otherUserId = 'user-owner-target';

  beforeEach(() => {
    userRepository = {
      create: jest.fn(),
      createWithTransaction: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIdAndCompany: jest.fn(),
      findByEmail: jest.fn(),
      findForAuthByEmail: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      updateRole: jest.fn(),
      updatePassword: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    passwordService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;

    roleService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<RoleService>;

    authSessionRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllByUserId: jest.fn(),
      rotate: jest.fn(),
    } as unknown as jest.Mocked<IAuthSessionRepository>;

    // Constructed directly (bypassing Nest's DI container) so this test
    // has no dependency on the module wiring — UserService's own
    // @Inject() decorators are metadata for Nest's resolver and don't
    // affect a plain `new` call.
    service = new UserService(
      userRepository,
      passwordService,
      roleService,
      authSessionRepository,
    );
  });

  /**
   * Owner-created team members must be able to log in immediately —
   * see UserController.create's OwnerGuard and the comment in
   * UserService.create(). These values must never come from the
   * client: CreateUserDto has no isActive/isEmailVerified/isOwner
   * field, and the global ValidationPipe (forbidNonWhitelisted: true)
   * rejects any request body that tries to add them. The tests below
   * confirm the service itself is the source of truth regardless.
   */
  describe('create() — server-forced isActive/isEmailVerified for Owner-created team members', () => {
    const dto: CreateUserDto = {
      firstName: 'New',
      lastName: 'Member',
      email: 'member@example.com',
      password: 'TestPassword123!',
    };

    it('forces isActive: true, isEmailVerified: true, isOwner: false, and the caller company', async () => {
      userRepository.create.mockResolvedValue({ id: 'new-user' } as never);

      await service.create(dto, companyId);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          isOwner: false,
          isActive: true,
          isEmailVerified: true,
        }),
      );
    });

    it('hashes the password before handing it to the repository', async () => {
      userRepository.create.mockResolvedValue({ id: 'new-user' } as never);

      await service.create(dto, companyId);

      expect(passwordService.hash).toHaveBeenCalledWith(dto.password);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed-password' }),
      );
    });

    it('never trusts isOwner/isActive/isEmailVerified/companyId even if smuggled onto the dto object at runtime', async () => {
      // CreateUserDto has no such fields, so this only exercises
      // defense in depth: create() builds the repository DTO by
      // naming each field explicitly, never by spreading `dto` — so
      // even a dto object carrying extra properties (e.g. a future
      // caller that bypasses the ValidationPipe) can't influence the
      // result. The attacker's companyId is a different company than
      // the one passed as the trusted second argument.
      const attackerDto = {
        ...dto,
        isOwner: true,
        isActive: false,
        isEmailVerified: false,
        companyId: 'attacker-company',
      } as unknown as CreateUserDto;

      userRepository.create.mockResolvedValue({ id: 'new-user' } as never);

      await service.create(attackerDto, companyId);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          isOwner: false,
          isActive: true,
          isEmailVerified: true,
        }),
      );
    });
  });

  describe('update() — self-only authorization (F1)', () => {
    it('blocks the exact attack: caller targeting another same-company user with a new password', async () => {
      await expect(
        service.update(
          otherUserId,
          { password: 'AttackerChosenPassword123!' },
          companyId,
          callerId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Must reject before ever touching the repository — nothing about
      // the target should be looked up or persisted for a disallowed id.
      expect(userRepository.findByIdAndCompany).not.toHaveBeenCalled();
      expect(userRepository.update).not.toHaveBeenCalled();
      // Test D: rejected before any repository mutation — including
      // session revocation. A caller can never revoke another user's
      // sessions by targeting them with a disallowed password change.
      expect(authSessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
    });

    it('still blocks a cross-user update when no password is included', async () => {
      await expect(
        service.update(
          otherUserId,
          { firstName: 'Renamed' },
          companyId,
          callerId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(authSessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
    });

    it('allows a user to update their own profile, without revoking any session when no password changes', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: callerId,
        companyId,
      } as never);
      userRepository.update.mockResolvedValue({ id: callerId } as never);

      await service.update(
        callerId,
        { firstName: 'New Name' },
        companyId,
        callerId,
      );

      expect(userRepository.update).toHaveBeenCalledWith(
        callerId,
        companyId,
        expect.objectContaining({ firstName: 'New Name' }),
      );
      // A plain profile edit with no `password` field must never
      // revoke sessions — only an actual password change does.
      expect(authSessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
    });

    it('Test A/B/C — changes the caller’s own password: succeeds, hashes the new password, and revokes all of the caller’s sessions', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: callerId,
      } as never);
      userRepository.update.mockResolvedValue({ id: callerId } as never);

      // Test A: the user can change their own password (no throw).
      await service.update(
        callerId,
        { password: 'MyOwnNewPassword123!' },
        companyId,
        callerId,
      );

      // Test B: the new password is hashed via the existing
      // PasswordService before being persisted.
      expect(passwordService.hash).toHaveBeenCalledWith('MyOwnNewPassword123!');
      expect(userRepository.update).toHaveBeenCalledWith(
        callerId,
        companyId,
        expect.objectContaining({ passwordHash: 'hashed-password' }),
      );

      // Test C: after the password update succeeds, all of the
      // caller's own sessions are revoked via the real
      // AuthSessionRepository.revokeAllByUserId(userId) — never a
      // different id, since id === callerId was already enforced.
      expect(authSessionRepository.revokeAllByUserId).toHaveBeenCalledWith(
        callerId,
      );
      expect(authSessionRepository.revokeAllByUserId).toHaveBeenCalledTimes(1);

      // Revocation must happen strictly after the update resolved, not
      // before — assert call order, not just that both were called.
      const updateOrder = userRepository.update.mock.invocationCallOrder[0];
      const revokeOrder =
        authSessionRepository.revokeAllByUserId.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(revokeOrder);
    });

    it('Test E — does not revoke any session if the password update itself fails', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: callerId,
      } as never);
      userRepository.update.mockRejectedValue(new Error('DB write failed'));

      await expect(
        service.update(
          callerId,
          { password: 'MyOwnNewPassword123!' },
          companyId,
          callerId,
        ),
      ).rejects.toThrow('DB write failed');

      expect(authSessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
    });

    it('still enforces tenant isolation for a self-update (defense in depth)', async () => {
      // id === callerId, but the repository reports no such user in
      // this company (e.g. stale JWT after a cross-tenant edge case) —
      // must still 404, not silently succeed.
      userRepository.findByIdAndCompany.mockResolvedValue(null);

      await expect(
        service.update(callerId, { firstName: 'X' }, companyId, callerId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(authSessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
    });
  });

  describe('assignRole() — cross-tenant role assignment protection', () => {
    it('assigns a role that belongs to the caller’s own company', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: otherUserId,
        companyId,
      } as never);
      roleService.findById.mockResolvedValue({
        id: 'role-in-same-company',
        companyId,
      } as never);
      userRepository.updateRole.mockResolvedValue({
        id: otherUserId,
        roleId: 'role-in-same-company',
      } as never);

      await service.assignRole(otherUserId, 'role-in-same-company', companyId);

      expect(roleService.findById).toHaveBeenCalledWith(
        companyId,
        'role-in-same-company',
      );
      expect(userRepository.updateRole).toHaveBeenCalledWith(
        otherUserId,
        companyId,
        'role-in-same-company',
      );
    });

    it('rejects a roleId belonging to a different company, exactly like an unknown id', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: otherUserId,
        companyId,
      } as never);
      // RoleRepository.findById scopes by companyId, so a role from
      // another tenant simply doesn't resolve — RoleService turns that
      // into a NotFoundException, which is what we assert propagates.
      roleService.findById.mockRejectedValue(
        new NotFoundException(
          'Role with ID "role-in-other-company" not found.',
        ),
      );

      await expect(
        service.assignRole(otherUserId, 'role-in-other-company', companyId),
      ).rejects.toBeInstanceOf(NotFoundException);

      // The cross-tenant role must never actually be attached.
      expect(userRepository.updateRole).not.toHaveBeenCalled();
    });

    it('unassigns a role (roleId: null) without checking RoleService at all', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: otherUserId,
        companyId,
      } as never);
      userRepository.updateRole.mockResolvedValue({
        id: otherUserId,
        roleId: null,
      } as never);

      await service.assignRole(otherUserId, null, companyId);

      expect(roleService.findById).not.toHaveBeenCalled();
      expect(userRepository.updateRole).toHaveBeenCalledWith(
        otherUserId,
        companyId,
        null,
      );
    });

    it('404s before touching RoleService if the target user is not in this company', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue(null);

      await expect(
        service.assignRole(otherUserId, 'some-role', companyId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(roleService.findById).not.toHaveBeenCalled();
      expect(userRepository.updateRole).not.toHaveBeenCalled();
    });
  });
});
