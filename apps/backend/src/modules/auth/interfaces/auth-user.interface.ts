export interface IAuthUser {
  id: string;

  firstName: string;
  lastName: string;

  email: string;

  avatar: string | null;

  passwordHash: string | null;

  isActive: boolean;
  isEmailVerified: boolean;
  isOwner: boolean;

  companyId: string | null;
}
