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

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
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

    return true;
  } catch {
    return false;
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
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshSession().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;

      if (refreshed) {
        // Nothing to re-attach by hand — the browser sends the
        // newly-issued cookies automatically on retry.
        return api(originalRequest);
      }

      // Refresh failed — the session is genuinely over. There's no local
      // token cache to clear anymore; a consumer that cares (e.g. once a
      // protected dashboard exists) should treat this rejection, or a
      // failed /auth/me call, as "logged out".
    }

    return Promise.reject(error);
  },
);

export default api;