import axios from "axios";

/**
 * Shape of the error body the NestJS backend sends, e.g.:
 *   { success: false, statusCode: 400, message: "password is not strong enough" }
 * class-validator failures often send `message` as a string array instead
 * of a single string, so both are handled.
 */
interface BackendErrorBody {
  message?: string | string[];
}

/**
 * Pulls a human-readable message out of a failed request so SweetAlert2
 * can show the actual backend reason (e.g. "password is not strong
 * enough") instead of the generic "Request failed with status code 400"
 * that Axios puts on `error.message`.
 *
 * Falls back to `fallback` when nothing usable is found — including for
 * network errors, where the backend never got to respond at all.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as BackendErrorBody | undefined;
    const message = data?.message;

    if (Array.isArray(message) && message.length > 0) {
      return message.join(" ");
    }

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  // Covers the plain `Error`s thrown by the OAuth popup flow (e.g.
  // "Popup was blocked...", "Authentication was cancelled.").
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}