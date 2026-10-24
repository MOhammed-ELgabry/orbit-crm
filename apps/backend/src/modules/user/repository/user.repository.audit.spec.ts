/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- jest mock call records are untyped (`any`) by design */
import { NotFoundException } from '@nestjs/common';

import { UserRepository } from './user.repository';
import { AuditWriteFailedException } from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';

const audit: AuditActor = { actorUserId: 'owner-1', ipAddress: '203.0.113.7' };
const companyId = 'company-A';
const id = 'user-1';

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id,
  companyId,
  firstName: 'Omar',
  lastName: 'Ali',
  email: 'omar@example.test',
  phone: '+201000000000',
  avatar: null,
  passwordHash: 'HASH-SECRET',
  isActive: true,
  isOwner: false,
  roleId: 'role-old',
  deletedAt: null,
  ...overrides,
});

function makeMocks() {
  const tx = {
    user: {
      findFirst: jest.fn().mockResolvedValue(userRow()),
      findUnique: jest.fn().mockResolvedValue(userRow()),
      update: jest.fn().mockResolvedValue(userRow()),
    },
    role: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return { tx, repository: new UserRepository(prisma as never) };
}

const rows = (tx: ReturnType<typeof makeMocks>['tx']) =>
  tx.auditLog.create.mock.calls.map(
    (call: [{ data: Record<string, any> }]) => call[0].data,
  );

describe('UserRepository audit', () => {
  describe('updateStatus', () => {
    it('records status_change with isActive old/new', async () => {
      const { tx, repository } = makeMocks();
      tx.user.update.mockResolvedValue(userRow({ isActive: false }));

      await repository.updateStatus(id, companyId, false, audit);

      const [row] = rows(tx);
      expect(row.action).toBe('status_change');
      expect(row.changes).toEqual({ isActive: { old: true, new: false } });
      expect(row.companyId).toBe(companyId);
      expect(row.ipAddress).toBe('203.0.113.7');
    });

    it('writes no row when the status did not change', async () => {
      const { tx, repository } = makeMocks();

      await repository.updateStatus(id, companyId, true, audit);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('404 (and nothing written) for a user of another company', async () => {
      const { tx, repository } = makeMocks();
      tx.user.findFirst.mockResolvedValue(null);

      await expect(
        repository.updateStatus(id, companyId, false, audit),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.user.findFirst).toHaveBeenCalledWith({
        where: { id, companyId },
      });
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('records role_assign with the role ids and the (same-company) role names', async () => {
      const { tx, repository } = makeMocks();
      tx.user.update.mockResolvedValue(userRow({ roleId: 'role-new' }));
      tx.role.findMany.mockResolvedValue([
        { id: 'role-old', name: 'EMPLOYEE' },
        { id: 'role-new', name: 'MANAGER' },
      ]);

      await repository.updateRole(id, companyId, 'role-new', audit);

      expect(tx.role.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['role-old', 'role-new'] }, companyId },
        select: { id: true, name: true },
      });
      const [row] = rows(tx);
      expect(row.action).toBe('role_assign');
      expect(row.changes).toEqual({
        roleId: { old: 'role-old', new: 'role-new' },
      });
      expect(row.metadata).toEqual({
        previousRoleName: 'EMPLOYEE',
        newRoleName: 'MANAGER',
      });
    });

    it('records an unassignment (roleId: null) without looking up a null role', async () => {
      const { tx, repository } = makeMocks();
      tx.user.update.mockResolvedValue(userRow({ roleId: null }));
      tx.role.findMany.mockResolvedValue([
        { id: 'role-old', name: 'EMPLOYEE' },
      ]);

      await repository.updateRole(id, companyId, null, audit);

      const [row] = rows(tx);
      expect(row.changes).toEqual({ roleId: { old: 'role-old', new: null } });
      expect(row.metadata.newRoleName).toBeNull();
    });
  });

  describe('update (self-service profile)', () => {
    it('records name/phone changes as {changed:true} only — never the values', async () => {
      const { tx, repository } = makeMocks();
      tx.user.update.mockResolvedValue(
        userRow({ firstName: 'Omar2', phone: '+201111111111' }),
      );

      await repository.update(id, companyId, { firstName: 'Omar2' }, audit);

      const [row] = rows(tx);
      expect(row.changes).toEqual({
        firstName: { changed: true },
        phone: { changed: true },
      });
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('+2010');
      expect(serialized).not.toContain('+2011');
    });

    it('a password change writes user.password_changed (self_service) with NO values at all', async () => {
      const { tx, repository } = makeMocks();
      tx.user.update.mockResolvedValue(userRow({ passwordHash: 'NEW-HASH' }));

      await repository.update(
        id,
        companyId,
        { passwordHash: 'NEW-HASH' },
        audit,
      );

      const written = rows(tx);
      expect(written).toHaveLength(1);
      expect(written[0].action).toBe('password_changed');
      expect(written[0].metadata).toEqual({ method: 'self_service' });
      expect(written[0].changes).toBeUndefined();
      const serialized = JSON.stringify(written);
      expect(serialized).not.toContain('HASH-SECRET');
      expect(serialized).not.toContain('NEW-HASH');
    });

    it('does NOT write a password event for a plain profile edit', async () => {
      const { tx, repository } = makeMocks();

      await repository.update(id, companyId, { firstName: 'Omar' }, audit);

      expect(rows(tx).some((r) => r.action === 'password_changed')).toBe(false);
    });
  });

  describe('updatePassword (reset-token flow)', () => {
    it('reads the company from the row, writes password_changed (reset_token) atomically', async () => {
      const { tx, repository } = makeMocks();
      const actor: AuditActor = {
        actorUserId: id,
        metadata: { method: 'reset_token' },
      };

      await repository.updatePassword(id, 'NEW-HASH', actor);

      const [row] = rows(tx);
      expect(row).toEqual(
        expect.objectContaining({
          companyId,
          actorUserId: id,
          action: 'password_changed',
          entityType: 'user',
          entityId: id,
          metadata: { method: 'reset_token' },
        }),
      );
      expect(JSON.stringify(row)).not.toContain('NEW-HASH');
    });

    it('skips the audit row for a user without a company (no tenant can read it)', async () => {
      const { tx, repository } = makeMocks();
      tx.user.findUnique.mockResolvedValue(userRow({ companyId: null }));

      await repository.updatePassword(id, 'NEW-HASH', audit);

      expect(tx.user.update).toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('does not change the password when the audit row fails', async () => {
      const { tx, repository } = makeMocks();
      tx.auditLog.create.mockRejectedValueOnce(new Error('down'));

      await expect(
        repository.updatePassword(id, 'NEW-HASH', audit),
      ).rejects.toBeInstanceOf(AuditWriteFailedException);
    });
  });

  describe('delete', () => {
    it('soft-deletes and records user.delete in the same transaction', async () => {
      const { tx, repository } = makeMocks();

      await repository.delete(id, companyId, audit);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id, companyId },
        data: { deletedAt: expect.any(Date) },
      });
      const [row] = rows(tx);
      expect(row).toEqual(
        expect.objectContaining({
          action: 'delete',
          entityType: 'user',
          entityId: id,
          companyId,
        }),
      );
    });

    it('rejects when the audit row cannot be written', async () => {
      const { tx, repository } = makeMocks();
      tx.auditLog.create.mockRejectedValueOnce(new Error('down'));

      await expect(
        repository.delete(id, companyId, audit),
      ).rejects.toBeInstanceOf(AuditWriteFailedException);
    });
  });
});
