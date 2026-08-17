import axios from "axios";

import { tokenStorage } from "./tokenStorage";

// Falls back to the previous hardcoded value so nothing breaks if
// VITE_API_BASE_URL isn't set — but the new env var lets the social-login
// popup (and everything else) build correct URLs without another
// hardcoded copy of this address.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://162.35.172.155:3000";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const accessToken = tokenStorage.getAccessToken();

  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  try {
    // Deliberately a plain axios call (not the `api` instance) so this
    // request never re-enters these same interceptors.
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken,
    });

    const newAccessToken: string | undefined = response.data?.accessToken;
    const newRefreshToken: string | undefined = response.data?.refreshToken;

    if (!newAccessToken || !newRefreshToken) {
      return null;
    }

    tokenStorage.setTokens(newAccessToken, newRefreshToken);

    return newAccessToken;
  } catch {
    return null;
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
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newAccessToken = await refreshPromise;

      if (newAccessToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        return api(originalRequest);
      }

      // Refresh failed — the session is genuinely over. Clear local state
      // so the UI doesn't keep thinking the user is authenticated.
      tokenStorage.clear();
    }

    return Promise.reject(error);
  },
);

export default api;