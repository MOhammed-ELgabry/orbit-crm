import api from "./api";
import type { ApiEnvelope, PaginatedEnvelope, PaginationMeta } from "../types/api";
import type {
  CreateDealInput,
  Deal,
  DealQuery,
  UpdateDealInput,
} from "../types/deal";

export interface DealListResult {
  deals: Deal[];
  meta: PaginationMeta;
}

export const listDeals = async (
  query: DealQuery = {},
): Promise<DealListResult> => {
  const response = await api.get<PaginatedEnvelope<Deal>>("/deals", {
    params: query,
  });

  return { deals: response.data.data, meta: response.data.meta };
};

export const getDeal = async (id: string): Promise<Deal> => {
  const response = await api.get<ApiEnvelope<Deal>>(`/deals/${id}`);
  return response.data.data;
};

export const createDeal = async (input: CreateDealInput): Promise<Deal> => {
  const response = await api.post<ApiEnvelope<Deal>>("/deals", input);
  return response.data.data;
};

export const updateDeal = async (
  id: string,
  input: UpdateDealInput,
): Promise<Deal> => {
  const response = await api.patch<ApiEnvelope<Deal>>(`/deals/${id}`, input);
  return response.data.data;
};

export const deleteDeal = async (id: string): Promise<void> => {
  await api.delete(`/deals/${id}`);
};