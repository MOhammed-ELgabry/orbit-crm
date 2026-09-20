import api from "./api";
import type { ApiEnvelope } from "../types/api";

/**
 * Self-service Settings endpoints — a caller may only ever update their
 * own language/appearance (userId must be the authenticated caller's own
 * id; the backend 403s otherwise, mirroring the existing profile-update
 * endpoint). Each response is typed to only the field this service
 * reads, not the full user record the backend actually returns (the
 * same shape PATCH /users/:id already returns) — AuthContext merges
 * just that field into the already-loaded user rather than replacing the
 * whole object, so fields this narrower type doesn't know about
 * (like `permissions`) are never clobbered.
 */

export const updateLanguage = async (
  userId: string,
  language: "ar" | "en",
): Promise<{ language: "ar" | "en" }> => {
  const response = await api.patch<ApiEnvelope<{ language: "ar" | "en" }>>(
    `/users/${userId}/language`,
    { language },
  );

  return { language: response.data.data.language };
};

export const updateAppearance = async (
  userId: string,
  backgroundColor: string,
): Promise<{ backgroundColor: string | null }> => {
  const response = await api.patch<
    ApiEnvelope<{ backgroundColor: string | null }>
  >(`/users/${userId}/appearance`, { backgroundColor });

  return { backgroundColor: response.data.data.backgroundColor };
};
