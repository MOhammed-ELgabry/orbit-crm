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
}
