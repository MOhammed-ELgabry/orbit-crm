/* eslint-disable @typescript-eslint/no-unsafe-member-access -- jest mock call records are untyped (`any`) by design */
import { RoleRepository } from './role.repository';
import { AuditWriteFailedException } from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';

const audit: AuditActor = { actorUserId: 'actor-1' };
const companyId = 'company-A';
const roleId = 'role-1';

const perm = (id: string, resource: string, action: string) => ({
  permission: { id, resource, action },
});

const roleRow = (
  perms: ReturnType<typeof perm>[],
  overrides: Record<string, unknown> = {},
) => ({
  id: roleId,
  name: 'Sales',
  description: 'Sales team',
  companyId,
  createdAt: new Date(),
  updatedAt: new Date(),
  rolePermissions: perms,
  ...overrides,
});

function makeMocks() {
  const tx = {
    role: {
      create: jest.fn().mockResolvedValue({ id: roleId }),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rolePermission: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return { tx, prisma, repository: new RoleRepository(prisma as never) };
}

const auditData = (tx: ReturnType<typeof makeMocks>['tx'], index = 0) =>
  (tx.auditLog.create.mock.calls[index][0] as { data: Record<string, any> })
    .data;

describe('RoleRepository audit', () => {
  describe('create', () => {
    it('records role.create with the initial permissions as resource:action, in the same transaction', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findUniqueOrThrow.mockResolvedValue(
        roleRow([
          perm('p1', 'contact', 'read'),
          perm('p2', 'contact', 'create'),
        ]),
      );

      await repository.create(
        companyId,
        { name: 'Sales', permissionIds: ['p1', 'p2'] },
        audit,
      );

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const data = auditData(tx);
      expect(data).toEqual(
        expect.objectContaining({
          companyId,
          actorUserId: 'actor-1',
          action: 'create',
          entityType: 'role',
          entityId: roleId,
          entityLabel: 'Sales',
        }),
      );
      expect(data.changes.permissions).toEqual({
        added: ['contact:create', 'contact:read'],
        removed: [],
      });
    });

    it('fails the creation when the audit row cannot be written', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findUniqueOrThrow.mockResolvedValue(roleRow([]));
      tx.auditLog.create.mockRejectedValueOnce(new Error('down'));

      await expect(
        repository.create(companyId, { name: 'Sales' }, audit),
      ).rejects.toBeInstanceOf(AuditWriteFailedException);
    });
  });

  describe('update', () => {
    it('reads the "before" role (company-scoped) inside the transaction', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(roleRow([]));
      tx.role.findUniqueOrThrow.mockResolvedValue(roleRow([]));

      await repository.update(companyId, roleId, { name: 'Sales' }, audit);

      expect(tx.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: roleId, companyId, deletedAt: null },
        }),
      );
    });

    it('records the permissions diff (added / removed) and the changed name', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(
        roleRow([perm('p1', 'contact', 'read'), perm('p2', 'deal', 'read')]),
      );
      tx.role.findUniqueOrThrow.mockResolvedValue(
        roleRow([perm('p1', 'contact', 'read'), perm('p3', 'task', 'read')], {
          name: 'Sales Lead',
        }),
      );

      await repository.update(
        companyId,
        roleId,
        { name: 'Sales Lead', permissionIds: ['p1', 'p3'] },
        audit,
      );

      const data = auditData(tx);
      expect(data.action).toBe('update');
      expect(data.changes.name).toEqual({ old: 'Sales', new: 'Sales Lead' });
      expect(data.changes.permissions).toEqual({
        added: ['task:read'],
        removed: ['deal:read'],
      });
    });

    it('writes NO audit row when nothing changed (same name, same permission set)', async () => {
      const { tx, repository } = makeMocks();
      const same = [perm('p1', 'contact', 'read')];
      tx.role.findFirst.mockResolvedValue(roleRow(same));
      tx.role.findUniqueOrThrow.mockResolvedValue(roleRow(same));

      await repository.update(
        companyId,
        roleId,
        { name: 'Sales', permissionIds: ['p1'] },
        audit,
      );

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('returns null and writes nothing when the role does not exist in this company', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(null);

      const result = await repository.update(
        companyId,
        roleId,
        { name: 'X' },
        audit,
      );

      expect(result).toBeNull();
      expect(tx.role.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('a permissions-only change is audited even though name/description are unchanged', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(roleRow([]));
      tx.role.findUniqueOrThrow.mockResolvedValue(
        roleRow([perm('p1', 'contact', 'read')]),
      );

      await repository.update(
        companyId,
        roleId,
        { permissionIds: ['p1'] },
        audit,
      );

      expect(auditData(tx).changes).toEqual({
        permissions: { added: ['contact:read'], removed: [] },
      });
    });
  });

  describe('softDelete', () => {
    it('records role.delete with the number of users that lost the role', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(roleRow([]));
      tx.user.updateMany.mockResolvedValue({ count: 3 });

      const result = await repository.softDelete(companyId, roleId, audit);

      expect(result).toBe(true);
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { roleId, companyId },
        data: { roleId: null },
      });
      const data = auditData(tx);
      expect(data.action).toBe('delete');
      expect(data.metadata).toEqual({ affectedUsers: 3 });
    });

    it('returns false and writes nothing for a missing / foreign role', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(null);

      await expect(
        repository.softDelete(companyId, roleId, audit),
      ).resolves.toBe(false);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('rolls back (rejects) when the audit row cannot be written', async () => {
      const { tx, repository } = makeMocks();
      tx.role.findFirst.mockResolvedValue(roleRow([]));
      tx.auditLog.create.mockRejectedValueOnce(new Error('down'));

      await expect(
        repository.softDelete(companyId, roleId, audit),
      ).rejects.toBeInstanceOf(AuditWriteFailedException);
    });
  });
});
