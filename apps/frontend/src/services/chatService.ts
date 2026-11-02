import { isAxiosError } from "axios";

import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type {
  ChatAttachmentConfig,
  ChatAttachmentUploadResult,
  ChatBootstrap,
  ChatConversation,
  ChatMe,
  ChatMessagesPage,
  ChatMessagesQuery,
  ChatReadResult,
  ChatReceiptRow,
  ChatSendResult,
  ChatTeammate,
} from "../types/chat";

/**
 * REST boundary of Team Chat. The cookie session + CSRF header are handled
 * by the shared axios instance (including the single 401 refresh-and-retry),
 * so nothing here touches tokens. Identity is never sent: the server derives
 * the caller, company and participants itself.
 */

const id = encodeURIComponent;

export const getChatSession = async (): Promise<{
  me: ChatMe;
  serverTime: string;
}> => {
  const response =
    await api.get<ApiEnvelope<{ me: ChatMe; serverTime: string }>>(
      "/chat/session",
    );
  return response.data.data;
};

export const getChatBootstrap = async (): Promise<ChatBootstrap> => {
  const response = await api.get<ApiEnvelope<ChatBootstrap>>("/chat/bootstrap");
  return response.data.data;
};

export const listChatConversations = async (): Promise<ChatConversation[]> => {
  const response = await api.get<ApiEnvelope<ChatConversation[]>>(
    "/chat/conversations",
  );
  return response.data.data;
};

export const listChatTeammates = async (
  search?: string,
): Promise<ChatTeammate[]> => {
  const response = await api.get<ApiEnvelope<ChatTeammate[]>>(
    "/chat/teammates",
    { params: search ? { search } : undefined },
  );
  return response.data.data;
};

export const openDirectConversation = async (
  userId: string,
): Promise<ChatConversation> => {
  const response = await api.post<ApiEnvelope<ChatConversation>>(
    "/chat/conversations/direct",
    { userId },
  );
  return response.data.data;
};

export const getChatMessages = async (
  conversationId: string,
  query: ChatMessagesQuery = {},
): Promise<ChatMessagesPage> => {
  const response = await api.get<ApiEnvelope<ChatMessagesPage>>(
    `/chat/conversations/${id(conversationId)}/messages`,
    { params: query },
  );
  return response.data.data;
};

export const getChatReceipts = async (
  conversationId: string,
  from: number,
  to: number,
): Promise<ChatReceiptRow[]> => {
  const response = await api.get<ApiEnvelope<{ receipts: ChatReceiptRow[] }>>(
    `/chat/conversations/${id(conversationId)}/receipts`,
    { params: { from, to } },
  );
  return response.data.data.receipts;
};

export const sendChatMessage = async (
  conversationId: string,
  clientMessageId: string,
  body: string,
  attachmentId?: string,
): Promise<ChatSendResult> => {
  const response = await api.post<ApiEnvelope<ChatSendResult>>(
    `/chat/conversations/${id(conversationId)}/messages`,
    // The payload of a text-only message is exactly what it always was.
    attachmentId === undefined
      ? { clientMessageId, body }
      : { clientMessageId, body, attachmentId },
  );
  return response.data.data;
};

// --- attachments (DIRECT conversations) ----------------------------------

/** Whether attachments are available for this account, and their limits. */
export const getChatAttachmentConfig =
  async (): Promise<ChatAttachmentConfig> => {
    const response = await api.get<ApiEnvelope<ChatAttachmentConfig>>(
      "/chat/attachments/config",
    );
    return response.data.data;
  };

/**
 * Uploads ONE file (multipart field "file"). It is stored but not sent: the
 * returned attachment id goes into `sendChatMessage`. The multipart boundary
 * is set by the browser/axios, never by hand.
 */
export const uploadChatAttachment = async (
  conversationId: string,
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<ChatAttachmentUploadResult> => {
  const form = new FormData();
  form.append("file", file, file.name);

  const response = await api.post<ApiEnvelope<ChatAttachmentUploadResult>>(
    `/chat/conversations/${id(conversationId)}/attachments`,
    form,
    {
      signal: options.signal,
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) {
          options.onProgress?.(Math.min(1, event.loaded / event.total));
        }
      },
    },
  );
  return response.data.data;
};

/** Discards an attachment that was not sent (a sent one cannot be removed). */
export const cancelChatAttachment = async (
  conversationId: string,
  attachmentId: string,
): Promise<void> => {
  await api.delete(
    `/chat/conversations/${id(conversationId)}/attachments/${id(attachmentId)}`,
  );
};

/**
 * The file itself, through the authenticated, conversation-checked endpoint.
 * There is no public URL: the bytes arrive as a Blob that the caller turns
 * into a short-lived object URL (and revokes).
 */
export const fetchChatAttachmentBlob = async (
  conversationId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  const response = await api.get<Blob>(
    `/chat/conversations/${id(conversationId)}/attachments/${id(attachmentId)}`,
    { responseType: "blob", signal, timeout: 120_000 },
  );
  return response.data;
};

export const markChatRead = async (
  conversationId: string,
  upToSequence: number,
): Promise<ChatReadResult> => {
  const response = await api.post<ApiEnvelope<ChatReadResult>>(
    `/chat/conversations/${id(conversationId)}/read`,
    { upToSequence },
  );
  return response.data.data;
};

/** HTTP status of an axios failure, or undefined for network errors. */
export function httpStatusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/**
 * Whether re-sending the SAME clientMessageId could succeed. Network
 * failures, timeouts, rate limits and server errors can; a refusal by the
 * server (validation, no longer a participant, conflicting body) cannot.
 */
export function isRetryableSendFailure(error: unknown): boolean {
  const status = httpStatusOf(error);

  if (status === undefined) return true;
  return status === 401 || status === 408 || status === 429 || status >= 500;
}
