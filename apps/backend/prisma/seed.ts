/**
 * Seeds the global Permission catalog (see
 * src/modules/permission/constants/permission.constants.ts for the
 * canonical list and why it's a code constant, not hand-entered data),
 * then backfills the 4 default staff roles (MANAGER/SALES/SUPPORT/
 * EMPLOYEE — see src/modules/role/constants/default-roles.constants.ts)
 * for every existing company that doesn't already have them.
 *
 * Both steps are idempotent: safe to run any number of times, in any
 * environment. Permissions use (resource, action) as the natural key
 * via upsert, so re-running after adding a new entry to
 * PERMISSION_CATALOG only inserts what's new. Default roles are
 * upserted per company on the existing `@@unique([companyId, name])`
 * constraint via ensureDefaultRolesForCompany, which leaves any
 * already-existing role (including an owner's customized version of a
 * default-named one) completely untouched — see that function's doc
 * comment for the exact guarantee.
 *
 * New companies do not depend on this script — AuthService.verifyEmail()
 * and the social-signup new-company path both call
 * ensureDefaultRolesForCompany() directly inside the same transaction
 * that creates the company, so they always have their 4 default roles
 * from the moment they exist. This script's role-seeding step exists
 * purely to backfill companies that were created before that existed.
 *
 * Run with: npm run prisma:seed (wired to `prisma db seed` via the
 * "prisma" key in package.json, so `prisma migrate dev` / `migrate
 * reset` also run it automatically).
 */
import { PrismaClient } from '@prisma/client';

import { PERMISSION_CATALOG } from '../src/modules/permission/constants/permission.constants';
import { ensureDefaultRolesForCompany } from '../src/modules/role/utils/ensure-default-roles.util';

const prisma = new PrismaClient();

async function main() {
  for (const { resource, action } of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);

  // Backfill default roles for every existing company. Deliberately
  // sequential (not Promise.all) — this only ever runs against a
  // handful of companies in practice (seed/migration time, not a hot
  // request path), and sequential upserts are easier to reason about
  // and to debug from the log output below if one company's data is
  // ever unexpectedly malformed.
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const company of companies) {
    await ensureDefaultRolesForCompany(prisma, company.id);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Ensured default roles (MANAGER/SALES/SUPPORT/EMPLOYEE) for ` +
      `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}.`,
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });