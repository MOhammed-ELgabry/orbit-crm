import api from "./api";
import type {
  ApiEnvelope,
  PaginatedEnvelope,
  PaginationMeta,
} from "../types/api";
import type { CreateTeamMemberInput, TeamMember } from "../types/user";

export interface TeamMemberListResult {
  members: TeamMember[];
  meta: PaginationMeta;
}

export const listTeamMembers = async (
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<TeamMemberListResult> => {
  const response = await api.get<PaginatedEnvelope<TeamMember>>("/users", {
    params,
  });

  return { members: response.data.data, meta: response.data.meta };
};

/** Owner-only server-side (OwnerGuard) — calling this as a non-owner 403s. */
export const createTeamMember = async (
  input: CreateTeamMemberInput,
): Promise<TeamMember> => {
  const response = await api.post<ApiEnvelope<TeamMember>>("/users", input);

  return response.data.data;
};

/** Owner-only server-side. */
export const updateTeamMemberStatus = async (
  id: string,
  isActive: boolean,
): Promise<TeamMember> => {
  const response = await api.patch<ApiEnvelope<TeamMember>>(
    `/users/${id}/status`,
    { isActive },
  );

  return response.data.data;
};

/**
 * Owner-only server-side. Pass null to unassign. A roleId from another
 * company is rejected by the backend exactly like an unknown id (see
 * UserService.assignRole) — this never silently succeeds cross-tenant.
 */
export const assignTeamMemberRole = async (
  id: string,
  roleId: string | null,
): Promise<TeamMember> => {
  const response = await api.patch<ApiEnvelope<TeamMember>>(
    `/users/${id}/role`,
    { roleId },
  );

  return response.data.data;
};

/**
 * Uploads the caller's own profile picture. `picture` is the already
 * downscaled image (see prepareAvatarBlob). Resolves to the new picture
 * reference (`user.avatar`). The API only ever lets a user change their own.
 */
export const uploadAvatar = async (
  userId: string,
  picture: Blob,
): Promise<string> => {
  const body = new FormData();
  body.append(
    "avatar",
    picture,
    picture.type === "image/webp" ? "avatar.webp" : "avatar.jpg",
  );

  const response = await api.put<ApiEnvelope<{ avatar: string }>>(
    `/users/${userId}/avatar`,
    body,
  );

  return response.data.data.avatar;
};

/** Removes the caller's own picture (the UI falls back to initials). */
export const removeAvatar = async (userId: string): Promise<void> => {
  await api.delete(`/users/${userId}/avatar`);
};
