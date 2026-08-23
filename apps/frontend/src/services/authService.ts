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

export interface ResendVerificationData {
  email: string;
}

/**
 * onboardingToken authorizes exactly one further action — POST
 * /auth/business-type — and only that. It is not a session credential:
 * verify-email deliberately does not log the user in (see
 * OnboardingToken's doc comment in the backend schema). Hold it only in
 * memory (React Router navigation state) for the current step, the same
 * way `email` is already carried from Register to this page — never in
 * localStorage/sessionStorage.
 */
export interface VerifyEmailResponse {
  success: boolean;
  message: string;
  onboardingToken: string;
}

export interface LoginData {
  email: string;
  password: string;
}

/**
 * Safe, client-facing user shape returned by login, social auth, and
 * /auth/me. Mirrors the backend's ISafeAuthUser — never a token.
 */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  isOwner: boolean;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user: AuthUser;
}

export type SocialProvider = "google" | "facebook" | "microsoft";

/**
 * Must stay in sync with the backend's BUSINESS_TYPES constant
 * (backend/src/modules/company/constants/business-type.constants.ts).
 */
export type BusinessType = "medical_clinics" | "real_estate" | "auto_spare_parts";

export interface SetBusinessTypeData {
  token: string;
  businessType: BusinessType;
}

const SUCCESS_MESSAGE_TYPE = "orbit-social-auth-success";
const ERROR_MESSAGE_TYPE = "orbit-social-auth-error";

const SOCIAL_AUTH_TIMEOUT = 5 * 60 * 1000;

export const registerUser = async (data: RegisterData) => {
  const response = await api.post("/auth/register", data);

  return response.data;
};

export const verifyEmail = async (
  data: VerifyEmailData,
): Promise<VerifyEmailResponse> => {
  const response = await api.post("/auth/verify-email", data);

  return response.data;
};

export const resendVerification = async (
  data: ResendVerificationData,
): Promise<{ success: boolean; message: string }> => {
  const response = await api.post("/auth/resend-verification", data);

  return response.data;
};

export const setBusinessType = async (
  data: SetBusinessTypeData,
): Promise<{ success: boolean; message: string }> => {
  const response = await api.post("/auth/business-type", data);

  return response.data;
};

export const loginUser = async (
  data: LoginData,
): Promise<LoginResponse> => {
  const response = await api.post("/auth/login", data);

  return response.data;
};

/**
 * Opens a social authentication popup.
 *
 * Authentication flow:
 *
 * Frontend
 *   ↓
 * Backend /auth/social/:provider/start
 *   ↓
 * OAuth Provider
 *   ↓
 * Backend /auth/social/:provider/callback
 *   ↓
 * postMessage()
 *   ↓
 * Frontend
 *
 * Security:
 * - OAuth secrets remain on the backend.
 * - The backend sets the session as HttpOnly cookies directly on the
 *   popup's own navigation to its callback URL — by the time the popup
 *   posts its message, the browser already has the cookies for the API's
 *   domain, available to this window too. postMessage is only used to
 *   signal success/failure and carry the (non-sensitive) user profile.
 * - The message origin is strictly validated.
 * - No wildcard "*" origin is accepted.
 * - The authentication flow does not depend on popup.closed.
 * - Popup closing is best-effort only.
 */
export interface SocialAuthResult {
  user: AuthUser;
  /**
   * True only for a brand-new social sign-up (backend Scenario 1). An
   * existing user signing in via Google/Facebook/Microsoft (Scenarios
   * 2/3) already completed onboarding previously, so this is false and
   * onboardingToken is absent.
   */
  isNewUser: boolean;
  /** Present only when isNewUser is true. See VerifyEmailResponse. */
  onboardingToken?: string;
}

export function openSocialAuthPopup(
  provider: SocialProvider,
): Promise<SocialAuthResult> {
  return new Promise((resolve, reject) => {
    const baseURL = api.defaults.baseURL;

    if (!baseURL) {
      reject(new Error("API URL is not configured."));
      return;
    }

    let apiOrigin: string;

    try {
      apiOrigin = new URL(baseURL).origin;
    } catch {
      reject(new Error("Invalid API URL configuration."));
      return;
    }

    const popupUrl =
      `${baseURL}/auth/social/${provider}/start`;

    const popup = window.open(
      popupUrl,
      "orbit-social-auth",
      [
        "width=500",
        "height=650",
        "left=200",
        "top=100",
        "resizable=yes",
        "scrollbars=yes",
      ].join(","),
    );

    if (!popup) {
      reject(
        new Error(
          "Popup was blocked. Please allow popups for this site.",
        ),
      );
      return;
    }

    let settled = false;
    let timeoutId: number | undefined;

    const closePopup = () => {
      try {
        popup.close();
      } catch {
        // Browser may block popup closing.
      }
    };

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const finishSuccess = (result: SocialAuthResult) => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();
      closePopup();

      resolve(result);
    };

    const finishError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();
      closePopup();

      reject(error);
    };

    const handleMessage = (event: MessageEvent) => {
      /**
       * Only accept messages from our backend.
       */
      if (event.origin !== apiOrigin) {
        return;
      }

      if (!event.data || typeof event.data !== "object") {
        return;
      }

      const data = event.data as {
        type?: unknown;
        payload?: unknown;
      };

      if (typeof data.type !== "string") {
        return;
      }

      /**
       * Successful authentication.
       */
      if (data.type === SUCCESS_MESSAGE_TYPE) {
        const payload =
          data.payload && typeof data.payload === "object"
            ? (data.payload as {
                user?: unknown;
                isNewUser?: unknown;
                onboardingToken?: unknown;
              })
            : undefined;

        if (!payload?.user || typeof payload.user !== "object") {
          finishError(
            new Error("Invalid authentication response."),
          );

          return;
        }

        finishSuccess({
          user: payload.user as AuthUser,
          isNewUser: payload.isNewUser === true,
          onboardingToken:
            typeof payload.onboardingToken === "string"
              ? payload.onboardingToken
              : undefined,
        });

        return;
      }

      /**
       * Failed authentication.
       */
      if (data.type === ERROR_MESSAGE_TYPE) {
        const payload =
          data.payload &&
          typeof data.payload === "object"
            ? (data.payload as {
                message?: unknown;
              })
            : undefined;

        const message =
          typeof payload?.message === "string"
            ? payload.message
            : "Social authentication failed.";

        finishError(new Error(message));
      }
    };

    window.addEventListener(
      "message",
      handleMessage,
    );

    /**
     * OAuth timeout.
     *
     * We intentionally do not inspect popup.closed.
     * Chrome can restrict popup state access because
     * of Cross-Origin-Opener-Policy.
     */
    timeoutId = window.setTimeout(() => {
      finishError(
        new Error(
          "Authentication timed out. Please try signing in again.",
        ),
      );
    }, SOCIAL_AUTH_TIMEOUT);
  });
}

/**
 * Returns the currently authenticated user (via the session cookie), or
 * rejects if there isn't a valid session. Used to restore auth state on
 * app load, since there's no local token/user cache to read synchronously
 * anymore.
 */
export const getCurrentUser = async (): Promise<{
  success: boolean;
  message: string;
  user: AuthUser;
}> => {
  const response = await api.get("/auth/me");

  return response.data;
};

/**
 * Ends the session. No parameters: the refresh cookie (and the matching
 * CSRF header, attached automatically by api.ts's interceptor) is all the
 * backend needs to know which session to revoke.
 */
export const logoutUser = async () => {
  const response = await api.post("/auth/logout");

  return response.data;
};

export default api;