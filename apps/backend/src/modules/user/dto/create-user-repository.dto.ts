export class CreateUserRepositoryDto {
  firstName: string;

  lastName: string;

  email: string;

  passwordHash: string;

  phone?: string | null;

  avatar?: string | null;

  companyId: string;

  isOwner?: boolean;
}
