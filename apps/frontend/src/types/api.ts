/**
 * Matches backend/src/common/interceptors/response.interceptor.ts's
 * standard envelope. AuthController's handlers (login/register/me/etc.)
 * build and return their own pre-formed envelope instead — see that
 * interceptor's comment — so authService.ts's response types
 * deliberately don't use these; everything else does.
 */
export interface ApiEnvelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedEnvelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T[];
  meta: PaginationMeta;
  timestamp: string;
}
