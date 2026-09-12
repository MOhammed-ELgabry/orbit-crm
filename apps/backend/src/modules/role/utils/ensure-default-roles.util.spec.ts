import { ensureDefaultRolesForCompany } from './ensure-default-roles.util';
import { DEFAULT_ROLE_DEFINITIONS } from '../constants/default-roles.constants';

interface RoleUpsertArgs {
  where: { companyId_name: { companyId: string; name: string } };
  update: Record<string, never>;
  create: {
    companyId: string;
    name: string;
    description: string;
    rolePermissions: {
      createMany: { data: { permissionId: string }[] };
    };
  };
}

describe('ensureDefaultRolesForCompany', () => {
  const companyId = 'company-1';

  // Mirrors the real Permission catalog shape closely enough for this
  // function's purposes: id + resource + action.
  const mockPermissions = [
    { id: 'perm-contact-create', resource: 'contact', action: 'create' },
    { id: 'perm-contact-read', resource: 'contact', action: 'read' },
    { id: 'perm-contact-update', resource: 'contact', action: 'update' },
    { id: 'perm-contact-delete', resource: 'contact', action: 'delete' },
    { id: 'perm-activity-create', resource: 'activity', action: 'create' },
    { id: 'perm-activity-read', resource: 'activity', action: 'read' },
    { id: 'perm-activity-update', resource: 'activity', action: 'update' },
    { id: 'perm-activity-delete', resource: 'activity', action: 'delete' },
    { id: 'perm-user-create', resource: 'user', action: 'create' },
    { id: 'perm-user-read', resource: 'user', action: 'read' },
    { id: 'perm-user-update', resource: 'user', action: 'update' },
    { id: 'perm-user-delete', resource: 'user', action: 'delete' },
    { id: 'perm-company-read', resource: 'company', action: 'read' },
    { id: 'perm-company-update', resource: 'company', action: 'update' },
    { id: 'perm-role-manage', resource: 'role', action: 'manage' },
  ];

  const makePrismaMock = () => ({
    permission: {
      findMany: jest.fn().mockResolvedValue(mockPermissions),
    },
    role: {
      upsert: jest
        .fn<Promise<{ id: string }>, [RoleUpsertArgs]>()
        .mockResolvedValue({ id: 'role-x' }),
    },
  });

  it('upserts exactly the 4 default roles, never an OWNER role', async () => {
    const prisma = makePrismaMock();

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    expect(prisma.role.upsert).toHaveBeenCalledTimes(4);

    const upsertedNames = prisma.role.upsert.mock.calls.map(
      ([args]) => args.where.companyId_name.name,
    );

    expect(upsertedNames.sort()).toEqual(
      ['EMPLOYEE', 'MANAGER', 'SALES', 'SUPPORT'].sort(),
    );
    expect(upsertedNames).not.toContain('OWNER');
  });

  it('scopes every upsert to the given companyId via the companyId_name compound key', async () => {
    const prisma = makePrismaMock();

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    for (const [args] of prisma.role.upsert.mock.calls) {
      expect(args.where.companyId_name.companyId).toBe(companyId);
      expect(args.create.companyId).toBe(companyId);
    }
  });

  it('never touches an already-existing role: update is an empty no-op', async () => {
    const prisma = makePrismaMock();

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    for (const [args] of prisma.role.upsert.mock.calls) {
      expect(args.update).toEqual({});
    }
  });

  it("MANAGER's create payload attaches exactly its 8 default permission ids", async () => {
    const prisma = makePrismaMock();

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    const managerCall = prisma.role.upsert.mock.calls.find(
      ([args]) => args.create.name === 'MANAGER',
    );

    expect(managerCall).toBeDefined();

    const [managerArgs] = managerCall!;
    const grantedIds = managerArgs.create.rolePermissions.createMany.data.map(
      (row) => row.permissionId,
    );

    expect(grantedIds.sort()).toEqual(
      [
        'perm-contact-create',
        'perm-contact-read',
        'perm-contact-update',
        'perm-contact-delete',
        'perm-activity-create',
        'perm-activity-read',
        'perm-activity-update',
        'perm-activity-delete',
      ].sort(),
    );
  });

  it("EMPLOYEE's create payload is read-only (contact:read + activity:read)", async () => {
    const prisma = makePrismaMock();

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    const employeeCall = prisma.role.upsert.mock.calls.find(
      ([args]) => args.create.name === 'EMPLOYEE',
    );

    expect(employeeCall).toBeDefined();

    const [employeeArgs] = employeeCall!;
    const grantedIds = employeeArgs.create.rolePermissions.createMany.data.map(
      (row) => row.permissionId,
    );

    expect(grantedIds.sort()).toEqual(
      ['perm-contact-read', 'perm-activity-read'].sort(),
    );
  });

  it('none of the 4 default roles are granted user:create/read/update/delete, company:read/update, or role:manage', () => {
    // Direct assertion against the source of truth, independent of the
    // mock above — this is what actually governs production behavior.
    const adminLikeKeys = new Set([
      'user:create',
      'user:read',
      'user:update',
      'user:delete',
      'company:read',
      'company:update',
      'role:manage',
    ]);

    for (const role of DEFAULT_ROLE_DEFINITIONS) {
      for (const permission of role.permissions) {
        const key = `${permission.resource}:${permission.action}`;
        expect(adminLikeKeys.has(key)).toBe(false);
      }
    }
  });

  it('throws a clear error if a required permission is missing from the catalog (seed-ordering bug), instead of silently seeding an incomplete role', async () => {
    const prisma = makePrismaMock();
    // Simulate the permission seed not having run yet.
    prisma.permission.findMany.mockResolvedValue([]);

    await expect(
      ensureDefaultRolesForCompany(prisma as never, companyId),
    ).rejects.toThrow(/permission "contact:create".*not found/);

    expect(prisma.role.upsert).not.toHaveBeenCalled();
  });
});
