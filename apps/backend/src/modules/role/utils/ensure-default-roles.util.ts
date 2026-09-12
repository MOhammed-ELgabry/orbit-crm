import type { Prisma, PrismaClient } from '@prisma/client';

import { DEFAULT_ROLE_DEFINITIONS } from '../constants/default-roles.constants';

/**
 * Anything with the subset of the Prisma client API this needs — either
 * the top-level PrismaClient (used by prisma/seed.ts, which runs
 * entirely outside Nest's DI container and so has no injected
 * PrismaService to work with) or a Prisma.TransactionClient handed in
 * from an existing `$transaction(async (tx) => ...)` callback (used by
 * AuthService.verifyEmail() and the social-signup new-company path, so
 * role creation commits atomically with the company/user rows it
 * belongs to).
 */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Ensures the 4 default staff roles (MANAGER/SALES/SUPPORT/EMPLOYEE)
 * exist for one company, each with its default permission grant from
 * DEFAULT_ROLE_DEFINITIONS. No OWNER role is ever created — Owner
 * privilege stays isOwner-only.
 *
 * Idempotent and safe to re-run: each role is upserted on the existing
 * `@@unique([companyId, name])` constraint. If a role with that exact
 * name already exists for this company — whether from a previous run
 * of this same function, or because an Owner independently created or
 * customized a role with that name through the normal Role API — it is
 * left completely untouched (`update: {}`, a genuine no-op: no fields
 * change, updatedAt does not bump, and no permission grants are
 * added, removed, or reset). Only a role that does not exist yet gets
 * created, with its default permissions attached in the same write.
 * This is deliberately conservative: re-running this function (e.g.
 * after DEFAULT_ROLE_DEFINITIONS gains a new entry in the future) can
 * only ever add a missing role — it can never silently overwrite an
 * owner's existing customization of one that already exists.
 */
export async function ensureDefaultRolesForCompany(
  prisma: PrismaLike,
  companyId: string,
): Promise<void> {
  // The full catalog is small (15 rows) and completely static, so one
  // unfiltered fetch is simpler than building a per-role OR filter, and
  // the map below serves every role definition's lookups.
  const allPermissions = await prisma.permission.findMany();

  const permissionIdByKey = new Map(
    allPermissions.map((permission) => [
      `${permission.resource}:${permission.action}`,
      permission.id,
    ]),
  );

  for (const roleDefinition of DEFAULT_ROLE_DEFINITIONS) {
    const permissionIds = roleDefinition.permissions.map(
      ({ resource, action }) => {
        const key = `${resource}:${action}`;
        const permissionId = permissionIdByKey.get(key);

        if (!permissionId) {
          // Indicates the Permission catalog seed hasn't run yet, or
          // DEFAULT_ROLE_DEFINITIONS references a pair that was
          // removed from PERMISSION_CATALOG — a setup/ordering bug,
          // not a runtime/tenant condition, so failing loudly here
          // (aborting the enclosing transaction if there is one) is
          // correct rather than silently seeding an incomplete role.
          throw new Error(
            `ensureDefaultRolesForCompany: permission "${key}" required ` +
              `by default role "${roleDefinition.name}" was not found in ` +
              'the Permission table. Run the Prisma permission seed first.',
          );
        }

        return permissionId;
      },
    );

    await prisma.role.upsert({
      where: {
        companyId_name: {
          companyId,
          name: roleDefinition.name,
        },
      },
      update: {},
      create: {
        companyId,
        name: roleDefinition.name,
        description: roleDefinition.description,
        rolePermissions: {
          createMany: {
            data: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
      },
    });
  }
}
