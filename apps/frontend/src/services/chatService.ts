import { isAxiosError } from "axios";

import api from "./api";
import type { ApiEnvelope } from "../types/api";
import type {
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
): Promise<ChatSendResult> => {
  const response = await api.post<ApiEnvelope<ChatSendResult>>(
    `/chat/conversations/${id(conversationId)}/messages`,
    { clientMessageId, body },
  );
  return response.data.data;
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
