import { ensurePermissionsExist } from './ensure-permissions-exist.util';

interface PermissionUpsertArgs {
  where: { resource_action: { resource: string; action: string } };
  update: Record<string, never>;
  create: { resource: string; action: string };
}

describe('ensurePermissionsExist', () => {
  const makePrismaMock = () => ({
    permission: {
      upsert: jest
        .fn<Promise<{ id: string }>, [PermissionUpsertArgs]>()
        .mockResolvedValue({ id: 'perm-x' }),
    },
  });

  it('upserts every given permission exactly once, in order', async () => {
    const prisma = makePrismaMock();
    const permissions = [
      { resource: 'lead', action: 'create' },
      { resource: 'lead', action: 'read' },
    ];

    await ensurePermissionsExist(prisma as never, permissions);

    expect(prisma.permission.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.permission.upsert.mock.calls[0][0].create).toEqual({
      resource: 'lead',
      action: 'create',
    });
    expect(prisma.permission.upsert.mock.calls[1][0].create).toEqual({
      resource: 'lead',
      action: 'read',
    });
  });

  it("upserts on the schema's (resource, action) natural key, with a genuine no-op update", async () => {
    const prisma = makePrismaMock();

    await ensurePermissionsExist(prisma as never, [
      { resource: 'lead', action: 'delete' },
    ]);

    const [args] = prisma.permission.upsert.mock.calls[0];
    expect(args.where).toEqual({
      resource_action: { resource: 'lead', action: 'delete' },
    });
    expect(args.update).toEqual({});
    expect(args.create).toEqual({ resource: 'lead', action: 'delete' });
  });

  it('is a no-op when given an empty list', async () => {
    const prisma = makePrismaMock();

    await ensurePermissionsExist(prisma as never, []);

    expect(prisma.permission.upsert).not.toHaveBeenCalled();
  });
});
