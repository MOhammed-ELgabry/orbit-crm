import axios from "axios";

// Falls back to the previous hardcoded value so nothing breaks if
// VITE_API_BASE_URL isn't set — but the new env var lets the social-login
// popup (and everything else) build correct URLs without another
// hardcoded copy of this address.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://162.35.172.155:3000";

// Must match AUTH_COOKIE_NAMES.csrfToken on the backend
// (modules/auth/utils/cookie-options.util.ts). This one cookie is
// deliberately not HttpOnly so it can be read here and echoed back as a
// header — see backend common/security/csrf.guard.ts for why that
// round-trip is what makes it work as CSRF protection.
const CSRF_COOKIE_NAME = "orbit_csrf_token";

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));

  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match.slice(prefix.length));
}

const api = axios.create({
  baseURL: API_BASE_URL,
  // The whole session now lives in HttpOnly cookies rather than tokens
  // this code can read — every request (not just auth ones) needs to
  // carry them, and the API is not guaranteed to be same-site with the
  // frontend, so this must be explicit.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();

  const isStateChanging =
    !!method && !["GET", "HEAD", "OPTIONS"].includes(method);

  if (isStateChanging) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);

    if (csrfToken) {
      config.headers = config.headers ?? {};
      config.headers["X-CSRF-Token"] = csrfToken;
    }
  }

  return config;
});

// ---------------------------------------------------------------------------
// Centralized HTTP 401 handling (decision D3)
//
// The backend now rejects a request with 401 the moment an account is
// deactivated, even if the access cookie hasn't expired. This is the ONE
// place that reacts to a 401 for the whole app:
//
//   1. A 401 on a non-/auth/ request triggers exactly ONE session refresh
//      (concurrent 401s share that single refresh) and, if it succeeds,
//      exactly ONE retry of the original request (`_retry` guards it, so a
//      retry that 401s again is rejected, never retried again).
//   2. If the refresh is explicitly refused (the server answered with a
//      4xx — revoked/expired refresh token, inactive account), the session
//      is over: the registered listener is notified ONCE so AuthContext can
//      drop to the unauthenticated state, and ProtectedRoute then redirects
//      to /login through the router (no hard navigation, so no redirect
//      loop is possible).
//   3. While the session is marked ended, further 401s are rejected
//      immediately — no more refresh attempts, no retries — until a login
//      (or a successful session restore) marks the session active again.
//   4. A refresh that fails for a transient reason (network error, 5xx,
//      429) is NOT treated as the end of the session: the original request
//      just rejects and the user stays signed in.
//
// /auth/* requests are never refreshed or retried here: a 401 from login or
// /auth/me is a real answer the caller already handles, and refreshing on
// the refresh endpoint itself would recurse.
// ---------------------------------------------------------------------------

type RefreshOutcome = "refreshed" | "ended" | "unavailable";

let refreshPromise: Promise<RefreshOutcome> | null = null;

// True once we know there is no usable session (refresh refused, or an
// explicit logout). Starts false so a page that loads with a valid refresh
// cookie but an expired access cookie can still recover on its first 401.
let sessionEnded = false;

let sessionEndedListener: (() => void) | null = null;

/**
 * Registers the single listener that is told when the session has ended
 * (AuthProvider). Returns an unsubscribe function.
 */
export function setSessionEndedListener(listener: () => void): () => void {
  sessionEndedListener = listener;

  return () => {
    if (sessionEndedListener === listener) {
      sessionEndedListener = null;
    }
  };
}

/** Call after a successful login or session restore: 401s may refresh again. */
export function markSessionActive(): void {
  sessionEnded = false;
}

/**
 * Call on an explicit logout: stops any in-flight stale request from
 * starting a refresh with cookies that were just cleared. Does NOT notify
 * the listener (the caller is already handling the logout).
 */
export function markSessionInactive(): void {
  sessionEnded = true;
}

function endSession(): void {
  if (sessionEnded) {
    return;
  }

  sessionEnded = true;
  sessionEndedListener?.();
}

async function refreshSession(): Promise<RefreshOutcome> {
  try {
    // Deliberately a plain axios call (not the `api` instance) so this
    // request never re-enters these same interceptors. Still needs
    // withCredentials (to send the refresh cookie, scoped to /auth on the
    // backend) and the CSRF header (the refresh endpoint requires a
    // match — see backend AuthController).
    const csrfToken = readCookie(CSRF_COOKIE_NAME);

    await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      },
    );

    return "refreshed";
  } catch (refreshError) {
    const status = axios.isAxiosError(refreshError)
      ? refreshError.response?.status
      : undefined;

    // The server answered and said no (400 invalid/revoked/expired token or
    // inactive account, 401, 403): the session is over. Anything else
    // (no response at all, 5xx, 429) may be a blip — don't log anyone out.
    if (
      status !== undefined &&
      status >= 400 &&
      status < 500 &&
      status !== 429
    ) {
      return "ended";
    }

    return "unavailable";
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    const isAuthEndpoint =
      typeof originalRequest?.url === "string" &&
      originalRequest.url.includes("/auth/");

    if (
      error?.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      !sessionEnded
    ) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshSession()
          .then((outcome) => {
            if (outcome === "ended") {
              endSession();
            }

            return outcome;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const outcome = await refreshPromise;

      if (outcome === "refreshed") {
        // Nothing to re-attach by hand — the browser sends the
        // newly-issued cookies automatically on retry.
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
