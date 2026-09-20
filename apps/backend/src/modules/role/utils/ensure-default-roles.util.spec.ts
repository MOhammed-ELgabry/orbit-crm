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

interface PermissionUpsertArgs {
  where: { resource_action: { resource: string; action: string } };
  update: Record<string, never>;
  create: { resource: string; action: string };
}

describe('ensureDefaultRolesForCompany', () => {
  const companyId = 'company-1';

  // Mirrors the real Permission catalog (PERMISSION_CATALOG) exactly:
  // id + resource + action, contact/lead/activity/user/company/role.
  const mockPermissions = [
    { id: 'perm-contact-create', resource: 'contact', action: 'create' },
    { id: 'perm-contact-read', resource: 'contact', action: 'read' },
    { id: 'perm-contact-update', resource: 'contact', action: 'update' },
    { id: 'perm-contact-delete', resource: 'contact', action: 'delete' },
    { id: 'perm-lead-create', resource: 'lead', action: 'create' },
    { id: 'perm-lead-read', resource: 'lead', action: 'read' },
    { id: 'perm-lead-update', resource: 'lead', action: 'update' },
    { id: 'perm-lead-delete', resource: 'lead', action: 'delete' },
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
      // Not expected to be called at all while mockPermissions above is
      // complete (see "never calls permission.upsert..." below) — mocked
      // anyway so any test that does trigger the self-heal path doesn't
      // crash with "not a function".
      upsert: jest
        .fn<Promise<{ id: string }>, [PermissionUpsertArgs]>()
        .mockResolvedValue({ id: 'perm-unexpected-upsert' }),
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

  it("MANAGER's create payload attaches exactly its 12 default permission ids (contact + lead + activity CRUD)", async () => {
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
        'perm-lead-create',
        'perm-lead-read',
        'perm-lead-update',
        'perm-lead-delete',
        'perm-activity-create',
        'perm-activity-read',
        'perm-activity-update',
        'perm-activity-delete',
      ].sort(),
    );
  });

  it("EMPLOYEE's create payload is read-only (contact:read + lead:read + activity:read)", async () => {
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
      ['perm-contact-read', 'perm-lead-read', 'perm-activity-read'].sort(),
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

  it('never calls permission.upsert when the catalog already has everything a default role needs (steady-state cost is unchanged)', async () => {
    const prisma = makePrismaMock();

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    expect(prisma.permission.upsert).not.toHaveBeenCalled();
    expect(prisma.permission.findMany).toHaveBeenCalledTimes(1);
  });

  it('self-heals: upserts only the permissions actually missing from an incomplete catalog, then proceeds normally', async () => {
    const prisma = makePrismaMock();

    // The exact production scenario this fix targets: a catalog seeded
    // before the Lead feature shipped — every non-lead permission is
    // present, but all 4 lead:* rows are missing.
    const catalogMissingLead = mockPermissions.filter(
      (permission) => permission.resource !== 'lead',
    );

    prisma.permission.findMany
      .mockResolvedValueOnce(catalogMissingLead) // first read: lead:* missing
      .mockResolvedValueOnce(mockPermissions); // re-read after healing: complete

    prisma.permission.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ id: `perm-${create.resource}-${create.action}` }),
    );

    await ensureDefaultRolesForCompany(prisma as never, companyId);

    // Only the 4 missing lead:* rows were upserted — nothing already
    // present (contact/activity/user/company/role) was touched.
    expect(prisma.permission.upsert).toHaveBeenCalledTimes(4);

    const upsertedKeys = new Set(
      prisma.permission.upsert.mock.calls.map(
        ([args]) => `${args.create.resource}:${args.create.action}`,
      ),
    );
    expect(upsertedKeys).toEqual(
      new Set(['lead:create', 'lead:read', 'lead:update', 'lead:delete']),
    );

    // Every upsert used the schema's own (resource, action) natural
    // key, and a genuine no-op update — never overwrites an existing row.
    for (const [args] of prisma.permission.upsert.mock.calls) {
      expect(args.where.resource_action.resource).toBe(args.create.resource);
      expect(args.where.resource_action.action).toBe(args.create.action);
      expect(args.update).toEqual({});
    }

    // And role creation still proceeded normally afterward, with all 4
    // roles correctly granted their lead:* permissions.
    expect(prisma.role.upsert).toHaveBeenCalledTimes(4);
  });

  it('throws a clear error if a required permission is still missing even after attempting to self-heal the catalog', async () => {
    const prisma = makePrismaMock();
    // Simulate a catalog that can never be healed (e.g. a deeper
    // database problem) — findMany reports nothing, before or after
    // the self-heal's upsert attempts.
    prisma.permission.findMany.mockResolvedValue([]);

    await expect(
      ensureDefaultRolesForCompany(prisma as never, companyId),
    ).rejects.toThrow(
      /permission "contact:create".*could not be created or found.*self-heal/,
    );

    // It did attempt to self-heal before giving up — this is a "still
    // broken after trying" failure, not the old "nobody ran the seed"
    // failure.
    expect(prisma.permission.upsert).toHaveBeenCalled();
    expect(prisma.role.upsert).not.toHaveBeenCalled();
  });
});
