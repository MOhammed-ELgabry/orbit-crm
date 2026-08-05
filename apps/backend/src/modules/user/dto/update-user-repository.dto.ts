export class UpdateUserRepositoryDto {
  firstName?: string;

  lastName?: string;

  passwordHash?: string;

  phone?: string | null;

  avatar?: string | null;

  isOwner?: boolean;

  isActive?: boolean;
}
