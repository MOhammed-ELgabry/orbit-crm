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

  lastLoginAt: Date | null;

  companyId: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
