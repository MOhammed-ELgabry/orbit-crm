import { PrismaClient } from '@prisma/client';

import { DEFAULT_ROLE_DEFINITIONS } from '../src/modules/role/constants/default-roles.constants';

const prisma = new PrismaClient();

const LEAD_RESOURCE = 'lead';

/**
 * ensureDefaultRolesForCompany's own upsert (role/utils/ensure-default-
 * roles.util.ts) is deliberately `update: {}` on an already-existing
 * role — it can only ever create a role that's missing, never touch the
 * permissions of one that already exists (see that file's comment for
 * why: it must never silently overwrite an owner's own customization).
 * That means adding lead:* to DEFAULT_ROLE_DEFINITIONS only reaches
 * companies whose MANAGER/SALES/SUPPORT/EMPLOYEE role doesn't exist yet
 * — i.e. brand-new companies. This script is the one-time catch-up for
 * every company that already has these roles: it additively grants
 * exactly the lead:* permissions DEFAULT_ROLE_DEFINITIONS now specifies
 * for each of those 4 role names, and nothing else.
 *
 * Identification is by role NAME (companyId + name is unique), the same
 * assumption ensureDefaultRolesForCompany's own upsert already makes —
 * there is no isDefault flag on Role to distinguish "the stock default"
 * from "a custom role that happens to share one of these 4 names". A
 * company that renamed or otherwise customized a role sharing one of
 * these names will have lead:* added to it too, exactly as
 * ensureDefaultRolesForCompany would already treat it as the default
 * role for backfill purposes. A custom role with a genuinely different
 * name is never touched.
 *
 * Idempotent: `skipDuplicates: true` on the (roleId, permissionId)
 * composite key means a role that already has a given lead permission
 * (from a previous run of this script, or because
 * ensureDefaultRolesForCompany already created it fresh after this
 * shipped) is left exactly as it is — never duplicated, never touched.
 * Never deletes or modifies any existing RolePermission row.
 *
 * Run once, after deploying the schema migration and re-running
 * `npm run prisma:seed` (which inserts the new lead:* rows into the
 * Permission table — this script requires them to already exist):
 *
 *   npx ts-node --transpile-only prisma/backfill-lead-permissions.ts
 */
async function main() {
  const leadPermissions = await prisma.permission.findMany({
    where: { resource: LEAD_RESOURCE },
  });

  if (leadPermissions.length === 0) {
    throw new Error(
      'No "lead" permissions found in the Permission table. Run ' +
        '`npm run prisma:seed` first so PERMISSION_CATALOG\'s new lead ' +
        'entries are inserted, then re-run this backfill.',
    );
  }

  const leadPermissionIdByAction = new Map(
    leadPermissions.map((permission) => [permission.action, permission.id]),
  );

  let totalInserted = 0;
  let totalRolesChecked = 0;

  for (const roleDefinition of DEFAULT_ROLE_DEFINITIONS) {
    const leadActionsForThisRole = roleDefinition.permissions
      .filter((permission) => permission.resource === LEAD_RESOURCE)
      .map((permission) => permission.action);

    if (leadActionsForThisRole.length === 0) {
      continue;
    }

    const permissionIds = leadActionsForThisRole.map((action) => {
      const id = leadPermissionIdByAction.get(action);

      if (!id) {
        throw new Error(
          `Missing Permission row for ${LEAD_RESOURCE}:${action}. Run ` +
            '`npm run prisma:seed` first.',
        );
      }

      return id;
    });

    const matchingRoles = await prisma.role.findMany({
      where: { name: roleDefinition.name, deletedAt: null },
      select: { id: true, companyId: true },
    });

    totalRolesChecked += matchingRoles.length;

    for (const role of matchingRoles) {
      const result = await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });

      totalInserted += result.count;
    }
  }

  console.log(
    `Backfill complete. Checked ${totalRolesChecked} existing default-named ` +
      `role row(s) across all companies, inserted ${totalInserted} new ` +
      'RolePermission row(s). Safe to run again — a second run will find ' +
      '0 to insert.',
  );
}

main()
  .catch((error) => {
    console.error('Lead permission backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });