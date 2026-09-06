export const PERMISSION_REPOSITORY = 'PERMISSION_REPOSITORY';

/**
 * The fixed catalog of (resource, action) permissions available to be
 * attached to a Role via RolePermission. Kept as an application-level
 * constant rather than left purely data-driven, so the set of possible
 * permissions is reviewable in code and can't silently drift per
 * environment — the same tradeoff already used for BUSINESS_TYPES and
 * ACTIVITY_TYPES elsewhere in this codebase.
 *
 * Seeded into the database by prisma/seed.ts (idempotent — safe to
 * re-run). Adding a new permission here requires re-running the seed;
 * it never requires a schema migration.
 *
 * Not every permission below is currently checked by a guard — see
 * PermissionsGuard's call sites for which ones are actively enforced
 * today. The rest exist so the catalog (and therefore what an owner can
 * express when building a role) is complete from day one, ahead of more
 * endpoints adopting enforcement incrementally.
 */
export const PERMISSION_CATALOG = [
  { resource: 'contact', action: 'create' },
  { resource: 'contact', action: 'read' },
  { resource: 'contact', action: 'update' },
  { resource: 'contact', action: 'delete' },

  { resource: 'activity', action: 'create' },
  { resource: 'activity', action: 'read' },
  { resource: 'activity', action: 'update' },
  { resource: 'activity', action: 'delete' },

  { resource: 'user', action: 'create' },
  { resource: 'user', action: 'read' },
  { resource: 'user', action: 'update' },
  { resource: 'user', action: 'delete' },

  { resource: 'company', action: 'read' },
  { resource: 'company', action: 'update' },

  { resource: 'role', action: 'manage' },
] as const;

export type PermissionResource = (typeof PERMISSION_CATALOG)[number]['resource'];
export type PermissionAction = (typeof PERMISSION_CATALOG)[number]['action'];
