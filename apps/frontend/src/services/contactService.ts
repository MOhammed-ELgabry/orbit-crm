import api from "./api";
import type {
  ApiEnvelope,
  PaginatedEnvelope,
  PaginationMeta,
} from "../types/api";
import type {
  Contact,
  ContactQuery,
  CreateContactInput,
  UpdateContactInput,
} from "../types/contact";
import type {
  ImportRequestRow,
  ImportResponse,
  ImportValidateResponse,
} from "../types/contactImport";

export interface ContactListResult {
  contacts: Contact[];
  meta: PaginationMeta;
}

export const listContacts = async (
  query: ContactQuery = {},
): Promise<ContactListResult> => {
  const response = await api.get<PaginatedEnvelope<Contact>>("/contacts", {
    params: query,
  });

  return { contacts: response.data.data, meta: response.data.meta };
  //   return {
  //   contacts: Array.isArray(response.data?.data) ? response.data.data : [],
  //   meta: response.data.meta,
  // };
};

export const getContact = async (id: string): Promise<Contact> => {
  const response = await api.get<ApiEnvelope<Contact>>(`/contacts/${id}`);

  return response.data.data;
};

export const createContact = async (
  input: CreateContactInput,
): Promise<Contact> => {
  const response = await api.post<ApiEnvelope<Contact>>("/contacts", input);

  return response.data.data;
};

export const updateContact = async (
  id: string,
  input: UpdateContactInput,
): Promise<Contact> => {
  const response = await api.patch<ApiEnvelope<Contact>>(
    `/contacts/${id}`,
    input,
  );

  return response.data.data;
};

export const deleteContact = async (id: string): Promise<void> => {
  await api.delete(`/contacts/${id}`);
};

/**
 * Dry-run of a contacts import chunk (at most 100 rows): reports which rows
 * are valid / duplicate / invalid without saving anything.
 */
export const validateContactImport = async (
  rows: ImportRequestRow[],
): Promise<ImportValidateResponse> => {
  const response = await api.post<ApiEnvelope<ImportValidateResponse>>(
    "/contacts/import/validate",
    { rows },
  );

  return response.data.data;
};

/** Imports a chunk (at most 100 rows). Partial success is reported per row. */
export const importContacts = async (
  rows: ImportRequestRow[],
): Promise<ImportResponse> => {
  const response = await api.post<ApiEnvelope<ImportResponse>>(
    "/contacts/import",
    { rows },
  );

  return response.data.data;
};

export const contactDisplayName = (contact: Contact): string =>
  `${contact.firstName} ${contact.lastName}`.trim();
