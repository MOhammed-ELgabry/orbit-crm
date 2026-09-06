export interface TeamMember {
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
  lastLoginAt: string | null;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateTeamMemberInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}
