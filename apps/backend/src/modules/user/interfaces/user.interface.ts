/**
 * Minimal (id, name) projection of the Role a user is assigned — never
 * the full RoleEntity (no description/permissions/companyId). This is
 * a read projection of the existing Role relation for display purposes
 * (e.g. the Team Members page), not a second source of truth for role
 * data — the Role row itself, managed entirely by RoleModule, remains
 * the only place role data is created/updated.
 */
export interface IUserRole {
  id: string;
  name: string;
}

export interface IUser {
  id: string;

  firstName: string;
  lastName: string;

  email: string;

  phone: string | null;
  avatar: string | null;

  isActive: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;

  roleId: string | null;

  /**
   * Populated only by UserRepository.findAll() (via Prisma `include`),
   * which is the only query the Team Members page reads from — every
   * other repository method still returns the plain scalar user, so
   * this is `undefined` there. `null` specifically means "this user
   * has roleId: null" (see PermissionsGuard's roleId-null compatibility
   * shim for what that means for their access, and the Team page's
   * "Not Assigned" label for how it's shown). Consumers should treat
   * undefined and null the same way: no role information to show.
   */
  role?: IUserRole | null;

  lastLoginAt: Date | null;

  companyId: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}