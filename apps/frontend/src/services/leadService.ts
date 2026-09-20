import api from "./api";
import type {
  ApiEnvelope,
  PaginatedEnvelope,
  PaginationMeta,
} from "../types/api";
import type {
  CreateLeadInput,
  Lead,
  LeadQuery,
  UpdateLeadInput,
} from "../types/lead";

export interface LeadListResult {
  leads: Lead[];
  meta: PaginationMeta;
}

export const listLeads = async (
  query: LeadQuery = {},
): Promise<LeadListResult> => {
  const response = await api.get<PaginatedEnvelope<Lead>>("/leads", {
    params: query,
  });

  return { leads: response.data.data, meta: response.data.meta };
};

export const getLead = async (id: string): Promise<Lead> => {
  const response = await api.get<ApiEnvelope<Lead>>(`/leads/${id}`);

  return response.data.data;
};

export const createLead = async (input: CreateLeadInput): Promise<Lead> => {
  const response = await api.post<ApiEnvelope<Lead>>("/leads", input);

  return response.data.data;
};

export const updateLead = async (
  id: string,
  input: UpdateLeadInput,
): Promise<Lead> => {
  const response = await api.patch<ApiEnvelope<Lead>>(`/leads/${id}`, input);

  return response.data.data;
};

export const deleteLead = async (id: string): Promise<void> => {
  await api.delete(`/leads/${id}`);
};

export const leadDisplayName = (lead: Lead): string =>
  `${lead.firstName} ${lead.lastName}`.trim();
