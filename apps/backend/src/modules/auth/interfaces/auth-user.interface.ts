export interface IAuthUser {
  id: string;

  firstName: string;
  lastName: string;

  email: string;

  passwordHash: string | null;

  isActive: boolean;
  isEmailVerified: boolean;
  isOwner: boolean;

  companyId: string;
}
