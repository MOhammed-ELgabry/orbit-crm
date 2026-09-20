/**
 * Seeds the global Permission catalog (see
 * src/modules/permission/constants/permission.constants.ts for the
 * canonical list and why it's a code constant, not hand-entered data),
 * then creates the 4 default staff roles (MANAGER/SALES/SUPPORT/
 * EMPLOYEE — see src/modules/role/constants/default-roles.constants.ts)
 * for every existing company that doesn't already have them.
 *
 * Both steps are idempotent: safe to run any number of times, in any
 * environment. Permissions use (resource, action) as the natural key
 * via upsert (see ensurePermissionsExist), so re-running after adding a
 * new entry to PERMISSION_CATALOG only inserts what's new. Default
 * roles are upserted per company on the existing
 * `@@unique([companyId, name])` constraint via
 * ensureDefaultRolesForCompany, which leaves any already-existing role
 * (including an owner's customized version of a default-named one)
 * completely untouched — see that function's doc comment for the exact
 * guarantee. This step can only ever CREATE a role that's missing; it
 * never edits the permissions of one that already exists. Orbit
 * currently has no companies that predate the lead:* permissions, so
 * there is nothing to backfill, and this script deliberately has no
 * bulk/backfill step for that scenario.
 *
 * New companies do not *strictly* depend on this script —
 * AuthService.verifyEmail() and the social-signup new-company path both
 * call ensureDefaultRolesForCompany() directly inside the same
 * transaction that creates the company, and that function self-heals
 * any Permission rows it needs that aren't there yet (see its doc
 * comment), so a fresh company gets its 4 default roles, lead:*
 * included, from the moment it exists — even in an environment where
 * this script was never (re-)run. This script remains the right way to
 * pre-warm the *full* catalog (including permissions no default role
 * currently references, e.g. user/company/role) ahead of time, and to
 * create default roles for any company that was created before
 * ensureDefaultRolesForCompany existed.
 *
 * Run with: npm run prisma:seed (wired to `prisma db seed` via the
 * "prisma" key in package.json, so `prisma migrate dev` / `migrate
 * reset` also run it automatically). Note `prisma migrate deploy` — the
 * standard production migration command — deliberately does NOT run
 * this automatically; that's Prisma's own documented behavior, not
 * specific to this repo.
 */
import { PrismaClient } from '@prisma/client';

import { PERMISSION_CATALOG } from '../src/modules/permission/constants/permission.constants';
import { ensurePermissionsExist } from '../src/modules/permission/utils/ensure-permissions-exist.util';
import { ensureDefaultRolesForCompany } from '../src/modules/role/utils/ensure-default-roles.util';

const prisma = new PrismaClient();

async function main() {
  await ensurePermissionsExist(prisma, PERMISSION_CATALOG);

  // eslint-disable-next-line no-console
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);

  // Create default roles for every existing company that doesn't
  // already have them. Deliberately sequential (not Promise.all) —
  // this only ever runs against a handful of companies in practice
  // (seed/migration time, not a hot request path), and sequential
  // upserts are easier to reason about and to debug from the log
  // output below if one company's data is ever unexpectedly malformed.
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
