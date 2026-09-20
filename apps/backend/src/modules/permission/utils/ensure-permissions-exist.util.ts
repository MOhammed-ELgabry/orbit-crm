import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Anything with the subset of the Prisma client API this needs — either
 * the top-level PrismaClient (used by prisma/seed.ts, which runs
 * entirely outside Nest's DI container) or a Prisma.TransactionClient
 * handed in from an existing `$transaction(async (tx) => ...)` callback
 * (used by ensureDefaultRolesForCompany). Mirrors the PrismaLike type in
 * role/utils/ensure-default-roles.util.ts.
 */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export interface PermissionKey {
  resource: string;
  action: string;
}

/**
 * Idempotently ensures each (resource, action) pair exists as a row in
 * the Permission table, upserting on the schema's own
 * `@@unique([resource, action])` constraint (schema.prisma) — the same
 * natural key prisma/seed.ts has always upserted on.
 *
 * `update: {}` is a deliberate no-op on conflict: an existing row (its
 * id, description, createdAt, or any future column) is left completely
 * untouched. This function only ever adds a catalog row that's
 * missing — it never edits or removes a row that already exists, so:
 *   - running it against an already-complete catalog is a safe, cheap
 *     no-op for every entry;
 *   - running it concurrently (e.g. two brand-new companies registering
 *     at the same moment, both finding the same gap) is safe too —
 *     Postgres resolves each upsert's own ON CONFLICT atomically, one
 *     write wins and the other's `update: {}` is a no-op against the
 *     row the first one just created.
 *
 * Shared by two callers that each need the Permission catalog kept in
 * sync with code, at two different moments:
 *   - prisma/seed.ts — the full PERMISSION_CATALOG, run manually or via
 *     CI whenever an operator wants to (re)sync the catalog.
 *   - ensureDefaultRolesForCompany (role/utils/ensure-default-roles.util.ts)
 *     — just the subset DEFAULT_ROLE_DEFINITIONS actually needs, called
 *     automatically the moment a company is created, so a brand-new
 *     tenant's registration can never fail merely because nobody has
 *     (re-)run the seed script in this environment since the code's
 *     permission catalog last grew a new resource or action.
 */
export async function ensurePermissionsExist(
  prisma: PrismaLike,
  permissions: readonly PermissionKey[],
): Promise<void> {
  for (const { resource, action } of permissions) {
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
    });
  }
}
