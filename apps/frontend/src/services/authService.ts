import api from "./api";

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  companyName: string;
  avatar: string | null;
}

export interface VerifyEmailData {
  email: string;
  code: string;
}

export const registerUser = async (data: RegisterData) => {
  const response = await api.post("/auth/register", data);

  return response.data;
};

export const verifyEmail = async (data: VerifyEmailData) => {
  const response = await api.post("/auth/verify-email", data);

  return response.data;
};

export interface LoginData {
  email: string;
  password: string;
}

export const loginUser = async (data: LoginData) => {
  const response = await api.post("/auth/login", data);

  return response.data;
};

export interface SocialAuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isOwner: boolean;
}

export interface SocialAuthResult {
  success: boolean;
  message: string;
  accessToken: string;
  refreshToken: string;
  user: SocialAuthUser;
}

export type SocialProvider = "google" | "facebook" | "microsoft";

const SUCCESS_MESSAGE_TYPE = "orbit-social-auth-success";
const ERROR_MESSAGE_TYPE = "orbit-social-auth-error";

/**
 * Opens the given provider's OAuth flow in a popup and resolves once the
 * backend callback posts the result back via window.postMessage.
 *
 * Security:
 * - The popup navigates directly to our own backend's /auth/social/:provider/start
 *   endpoint — provider client secrets and the OAuth code exchange never touch
 *   the frontend at all.
 * - Incoming messages are validated against the backend's own origin (derived
 *   from the API base URL) before being trusted — '*' is never used, and a
 *   message from an unexpected origin is silently ignored, not accepted.
 * - Tokens are only ever received in the postMessage payload body, never via
 *   a URL query string.
 */
export function openSocialAuthPopup(
  provider: SocialProvider,
): Promise<SocialAuthResult> {
  return new Promise((resolve, reject) => {
    const expectedOrigin = new URL(api.defaults.baseURL as string).origin;

    const popup = window.open(
      `${api.defaults.baseURL}/auth/social/${provider}/start`,
      "orbit-social-auth",
      "width=500,height=650",
    );

    if (!popup) {
      reject(
        new Error("Popup was blocked. Please allow popups for this site."),
      );
      return;
    }

    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(pollTimer);
    };

    const handleMessage = (event: MessageEvent) => {
      // Reject anything not from our own backend's origin.
      if (event.origin !== expectedOrigin) {
        return;
      }

      const data = event.data as
        | { type?: string; payload?: unknown }
        | undefined;

      if (!data || typeof data !== "object" || typeof data.type !== "string") {
        return;
      }

      if (data.type === SUCCESS_MESSAGE_TYPE) {
        settled = true;
        cleanup();
        popup.close();
        resolve(data.payload as SocialAuthResult);
        return;
      }

      if (data.type === ERROR_MESSAGE_TYPE) {
        settled = true;
        cleanup();
        popup.close();
        const payload = data.payload as { message?: string } | undefined;
        reject(new Error(payload?.message ?? "Social authentication failed."));
      }
    };

    window.addEventListener("message", handleMessage);

    const pollTimer = window.setInterval(() => {
      if (popup.closed) {
        cleanup();

        if (!settled) {
          reject(new Error("Authentication was cancelled."));
        }
      }
    }, 500);
  });
}

export const refreshTokens = async (refreshToken: string) => {
  const response = await api.post("/auth/refresh", { refreshToken });

  return response.data;
};

export const logoutUser = async (refreshToken: string) => {
  const response = await api.post("/auth/logout", { refreshToken });

  return response.data;
};