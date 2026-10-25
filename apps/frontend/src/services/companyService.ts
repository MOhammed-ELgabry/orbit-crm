import api from "./api";
import type { ApiEnvelope } from "../types/api";

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
}

/** GET /companies/me — the authenticated user's own company. */
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
