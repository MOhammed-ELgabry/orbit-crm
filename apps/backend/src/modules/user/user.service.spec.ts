import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { UserService } from './user.service';
import type { IUserRepository } from './repository/user.repository.interface';
import { PasswordService } from './services/password.service';
import { RoleService } from '../role/role.service';

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

    // Constructed directly (bypassing Nest's DI container) so this test
    // has no dependency on the module wiring — UserService's own
    // @Inject() decorators are metadata for Nest's resolver and don't
    // affect a plain `new` call.
    service = new UserService(userRepository, passwordService, roleService);
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
    });

    it('allows a user to update their own profile', async () => {
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
    });

    it('hashes a self-service password change before persisting it', async () => {
      userRepository.findByIdAndCompany.mockResolvedValue({
        id: callerId,
      } as never);
      userRepository.update.mockResolvedValue({ id: callerId } as never);

      await service.update(
        callerId,
        { password: 'MyOwnNewPassword123!' },
        companyId,
        callerId,
      );

      expect(passwordService.hash).toHaveBeenCalledWith('MyOwnNewPassword123!');
      expect(userRepository.update).toHaveBeenCalledWith(
        callerId,
        companyId,
        expect.objectContaining({ passwordHash: 'hashed-password' }),
      );
    });

    it('still enforces tenant isolation for a self-update (defense in depth)', async () => {
      // id === callerId, but the repository reports no such user in
      // this company (e.g. stale JWT after a cross-tenant edge case) —
      // must still 404, not silently succeed.
      userRepository.findByIdAndCompany.mockResolvedValue(null);

      await expect(
        service.update(callerId, { firstName: 'X' }, companyId, callerId),
      ).rejects.toBeInstanceOf(NotFoundException);
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
        new NotFoundException('Role with ID "role-in-other-company" not found.'),
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