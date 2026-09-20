import type { Prisma, PrismaClient } from '@prisma/client';

import { DEFAULT_ROLE_DEFINITIONS } from '../constants/default-roles.constants';
import { ensurePermissionsExist } from '../../permission/utils/ensure-permissions-exist.util';

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
 * Every (resource, action) pair any DEFAULT_ROLE_DEFINITIONS entry
 * references, deduplicated. Derived from DEFAULT_ROLE_DEFINITIONS
 * itself — never hand-typed — so it can't drift out of sync with the
 * permissions the lookup below actually needs. See the "SELF-HEALS"
 * section of ensureDefaultRolesForCompany's doc comment for why this
 * exists.
 */
const REQUIRED_PERMISSIONS = Array.from(
  new Map(
    DEFAULT_ROLE_DEFINITIONS.flatMap((role) =>
      role.permissions.map(
        (permission) =>
          [`${permission.resource}:${permission.action}`, permission] as const,
      ),
    ),
  ).values(),
);

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
 *
 * SELF-HEALS THE PERMISSION CATALOG — READ BEFORE CHANGING
 * ----------------------------------------------------------
 * This function used to only *read* the Permission table and throw if
 * something it needed wasn't there. That's a correct safety net, but it
 * silently made every new company's registration depend on an operator
 * having already (re-)run `npm run prisma:seed` by hand in this exact
 * environment since PERMISSION_CATALOG last grew a new resource/action
 * (permission/constants/permission.constants.ts). `prisma migrate
 * deploy` — the standard production migration command — deliberately
 * never runs `db seed` (that's Prisma's own documented behavior, not a
 * bug here), so shipping a schema migration for a new resource (e.g.
 * the Lead model) does NOT by itself get that resource's permissions
 * into a deployed database's Permission table. Forgetting the separate
 * manual reseed step reproduces exactly the "permission ... was not
 * found" error this function used to throw on the very next brand-new
 * registration.
 *
 * So this function now ensures its own prerequisite instead of merely
 * asserting it: before doing any lookup, it upserts (via
 * ensurePermissionsExist — see that file for the idempotency/
 * concurrency guarantee) any of REQUIRED_PERMISSIONS not already
 * present. In the steady state — catalog already complete, true again
 * immediately after the first self-heal — this costs exactly the one
 * `findMany` the old version already made; it never writes. It only
 * writes the specific rows that are actually missing, and only when
 * they're actually missing. prisma/seed.ts still exists and remains the
 * right tool to pre-warm the *full* catalog (including permissions no
 * default role currently references) ahead of time — this is a
 * narrower, automatic safety net underneath it, not a replacement.
 *
 * The throw below is kept as a last-resort safety net. With the
 * self-heal in place it should be unreachable in normal operation — it
 * only fires if a permission is somehow still missing immediately after
 * ensurePermissionsExist just wrote it, which points to a genuine
 * database problem rather than a missing seed run.
 *
 * EXISTING COMPANIES WHOSE DEFAULT ROLE ALREADY EXISTS
 * ----------------------------------------------------------
 * The self-heal above fixes the Permission catalog, but `role.upsert`
 * is still `update: {}` on conflict — by design (see the paragraph
 * above on why). It can only ever CREATE a role that's missing; it
 * never edits the permissions of one that already exists. So a company
 * whose MANAGER/SALES/SUPPORT/EMPLOYEE role already existed before a
 * new permission was added to DEFAULT_ROLE_DEFINITIONS would never
 * receive that new grant through this function.
 *
 * That's intentional, not a gap: this function's job is "does this one
 * company have its 4 roles yet", not retroactively granting a newly
 * introduced permission to every company that predates it. Orbit has
 * no companies that predate the lead:* permissions, so there is
 * currently nothing to backfill, and this codebase deliberately has no
 * bulk/backfill mechanism for that scenario. If it's ever needed, it
 * belongs in its own separate, deliberately-run step — never inside
 * this function, for the same reason `update: {}` above must stay a
 * no-op.
 */
export async function ensureDefaultRolesForCompany(
  prisma: PrismaLike,
  companyId: string,
): Promise<void> {
  const buildPermissionIdByKey = (
    permissions: { resource: string; action: string; id: string }[],
  ) =>
    new Map(
      permissions.map((permission) => [
        `${permission.resource}:${permission.action}`,
        permission.id,
      ]),
    );

  let allPermissions = await prisma.permission.findMany();
  let permissionIdByKey = buildPermissionIdByKey(allPermissions);

  const missingPermissions = REQUIRED_PERMISSIONS.filter(
    ({ resource, action }) => !permissionIdByKey.has(`${resource}:${action}`),
  );

  if (missingPermissions.length > 0) {
    // Self-heal: insert exactly the rows this call needs and nothing
    // else. Idempotent and concurrency-safe — see ensurePermissionsExist.
    await ensurePermissionsExist(prisma, missingPermissions);

    allPermissions = await prisma.permission.findMany();
    permissionIdByKey = buildPermissionIdByKey(allPermissions);
  }

  for (const roleDefinition of DEFAULT_ROLE_DEFINITIONS) {
    const permissionIds = roleDefinition.permissions.map(
      ({ resource, action }) => {
        const key = `${resource}:${action}`;
        const permissionId = permissionIdByKey.get(key);

        if (!permissionId) {
          // Should be unreachable: this key was either already present
          // in permissionIdByKey, or included in missingPermissions and
          // just upserted by ensurePermissionsExist above. Firing here
          // means the row still isn't visible right after being
          // written — a genuine database problem, not a missing seed
          // run — so failing loudly (aborting the enclosing transaction
          // if there is one) is correct rather than silently seeding an
          // incomplete role.
          throw new Error(
            `ensureDefaultRolesForCompany: permission "${key}" required ` +
              `by default role "${roleDefinition.name}" could not be ` +
              'created or found in the Permission table, even after ' +
              'attempting to self-heal the catalog.',
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
