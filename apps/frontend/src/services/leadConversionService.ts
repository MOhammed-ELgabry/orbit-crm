import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type {
  ConvertLeadInput,
  ConvertLeadResult,
  LeadConversionPreview,
} from "../types/leadConversion";

/** Read-only: whether the won deal can convert its lead, and what it would do. */
export const previewLeadConversion = async (
  dealId: string,
): Promise<LeadConversionPreview> => {
  const response = await api.get<ApiEnvelope<LeadConversionPreview>>(
    `/deals/${dealId}/lead-conversion/preview`,
  );
  return response.data.data;
};

/** The explicit, user-confirmed conversion (one transaction on the server). */
export const convertLead = async (
  dealId: string,
  input: ConvertLeadInput,
): Promise<ConvertLeadResult> => {
  const response = await api.post<ApiEnvelope<ConvertLeadResult>>(
    `/deals/${dealId}/lead-conversion`,
    input,
  );
  return response.data.data;
};
