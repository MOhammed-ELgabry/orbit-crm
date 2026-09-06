/**
 * Seeds the global Permission catalog (see
 * src/modules/permission/constants/permission.constants.ts for the
 * canonical list and why it's a code constant, not hand-entered data).
 *
 * Idempotent: safe to run any number of times, in any environment.
 * Uses (resource, action) as the natural key via upsert, so re-running
 * after adding a new entry to PERMISSION_CATALOG only inserts what's
 * new — it never touches existing rows.
 *
 * Run with: npm run prisma:seed (wired to `prisma db seed` via the
 * "prisma" key in package.json, so `prisma migrate dev` / `migrate
 * reset` also run it automatically).
 */
import { PrismaClient } from '@prisma/client';

import { PERMISSION_CATALOG } from '../src/modules/permission/constants/permission.constants';

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
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Permission seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });