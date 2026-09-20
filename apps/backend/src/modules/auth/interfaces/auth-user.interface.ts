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

  roleId: string | null;

  companyId: string | null;

  language: string;

  backgroundColor: string | null;
}
