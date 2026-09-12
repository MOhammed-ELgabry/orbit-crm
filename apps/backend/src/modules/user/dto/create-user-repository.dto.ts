export class CreateUserRepositoryDto {
  firstName: string;

  lastName: string;

  email: string;

  passwordHash: string;

  phone?: string | null;

  avatar?: string | null;

  companyId: string;

  isOwner?: boolean;

  // Internal-only — never bound from the client-facing CreateUserDto.
  // Set explicitly by UserService.create() for Owner-created team
  // members so login is not gated on an email-verification step that
  // has no way to be completed for this creation path. Optional so
  // callers that omit them keep relying on the Prisma column defaults
  // (isActive @default(true), isEmailVerified @default(false)).
  isActive?: boolean;
  isEmailVerified?: boolean;

  // Internal-only, same as above. Set by
  // UserRepository.createWithinCompanyLimit() to the company's
  // EMPLOYEE role id, resolved inside that method's own transaction —
  // never left null for a team member created this way, so they never
  // land on PermissionsGuard's roleId: null compatibility path. Not
  // set by UserService.create() itself (see that repository method for
  // why). Optional because create() (the plain, non-limit-enforcing
  // variant) and createWithTransaction() have no such requirement and
  // simply leave it unset, falling back to the Prisma column default
  // (roleId, no @default — i.e. null).
  roleId?: string;
}
