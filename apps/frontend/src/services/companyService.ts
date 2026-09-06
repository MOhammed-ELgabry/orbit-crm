import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type { BusinessType } from "./authService";

/** Mirrors backend/src/modules/company/entities/company.entity.ts exactly. */
export interface Company {
  id: string;
  name: string;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
  logo: string | null;
  website: string | null;
  taxNumber: string | null;
  description: string | null;
  /**
   * Nullable: a company that hasn't finished onboarding (see
   * IndustrySelection) has no businessType yet. Typed as the shared
   * BusinessType union OR null OR an arbitrary string, since the
   * backend column itself is unconstrained TEXT (see
   * BUSINESS_TYPES's doc comment) — treat anything outside the 3 known
   * values as "unrecognized", not a crash.
   */
  businessType: BusinessType | null | string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UpdateCompanyInput {
  name?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  logo?: string;
  website?: string;
  taxNumber?: string;
  description?: string;
  businessType?: BusinessType;
}

/** GET /companies/me — the authenticated user's own company, incl. businessType for dashboard routing. */
export const getMyCompany = async (): Promise<Company> => {
  const response = await api.get<ApiEnvelope<Company>>("/companies/me");

  return response.data.data;
};

/** PATCH /companies/:id — owner-only server-side (OwnerGuard); calling this as a non-owner 403s. */
export const updateCompany = async (
  id: string,
  input: UpdateCompanyInput,
): Promise<Company> => {
  const response = await api.patch<ApiEnvelope<Company>>(
    `/companies/${id}`,
    input,
  );

  return response.data.data;
};
