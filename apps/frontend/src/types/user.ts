/** Minimal (id, name) projection of the assigned Role, for display only —
 * see backend IUser.role. Populated by GET /users (listTeamMembers); only
 * present when roleId is also non-null. Undefined and null both mean
 * "no role information to show" and should be treated the same way. */
export interface TeamMemberRole {
  id: string;
  name: string;
}

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
  role?: TeamMemberRole | null;
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