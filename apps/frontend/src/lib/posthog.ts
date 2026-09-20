import posthog from "posthog-js";

import type { AuthUser } from "../services/authService";

/**
 * VITE_POSTHOG_KEY / VITE_POSTHOG_HOST follow this project's existing
 * Vite env-var convention (see VITE_API_BASE_URL in services/api.ts —
 * same VITE_ prefix, same "read via import.meta.env, tolerate it being
 * unset" shape). Declared in vite-env.d.ts alongside VITE_API_BASE_URL.
 *
 * A PostHog project API key is a public, write-only identifier meant
 * to ship in client bundles (it cannot read data back out of PostHog)
 * — it is not a secret the way an API client secret or backend key
 * would be, so exposing it via VITE_ here is the correct treatment,
 * not an oversight.
 */
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

let isEnabled = false;

/**
 * Call once at app startup (see main.tsx), before anything else in
 * this module is used. No-ops with a console warning when the env
 * vars aren't configured — e.g. local dev without a PostHog project —
 * so the app runs normally and every other function here silently
 * does nothing rather than sending events to a hardcoded project or
 * throwing.
 */
export function initPostHog(): void {
  if (!POSTHOG_KEY || !POSTHOG_HOST) {
    console.warn(
      "PostHog is not configured (VITE_POSTHOG_KEY / VITE_POSTHOG_HOST are " +
        "unset) — analytics is disabled for this session.",
    );
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Pins PostHog's bundled default behavior — including automatic
    // SPA pageview capture via the browser History API, which is what
    // tracks navigation for this app's react-router-dom routes with no
    // extra route-change code needed here — to a specific dated
    // snapshot, so it can't silently change under us on a future
    // posthog-js upgrade. See https://posthog.com/docs/libraries/js/config#config-defaults.
    defaults: "2026-05-30",
  });

  isEnabled = true;
}

/**
 * Identifies the authenticated user so their events link to a real
 * person instead of an anonymous visitor.
 *
 * - distinct_id is user.id (a stable backend id) — never the email —
 *   per PostHog's own guidance on identify().
 * - email/name/is_owner ride along as person properties only, sourced
 *   entirely from AuthUser, the same safe/token-free shape already
 *   returned by /auth/me and used throughout the app (see
 *   authService.ts) — never anything from a login/register form value
 *   beyond what the backend already decided is safe to hand back.
 *
 * Called from AuthContext whenever `user` becomes non-null (fresh
 * login or an existing session restored on page load) — see that
 * file for why it isn't called at every individual login call site.
 */
export function identifyAnalyticsUser(user: AuthUser): void {
  if (!isEnabled) return;

  posthog.identify(user.id, {
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    is_owner: user.isOwner,
  });
}

/**
 * Clears the current PostHog identity and starts a fresh anonymous
 * one, so a second person using the same browser afterward — e.g. a
 * shared or kiosk machine — is never associated with the previous
 * user's session. Called from AuthContext's logout(), the one place
 * this app ends a session.
 */
export function resetAnalyticsIdentity(): void {
  if (!isEnabled) return;

  posthog.reset();
}

/**
 * Captures a product event. The only way any call site in this app
 * should reach posthog-js's capture() — thin on purpose, so "is
 * PostHog configured" lives in exactly one place rather than being
 * re-checked at every call site.
 *
 * Callers must never pass passwords, tokens (access/refresh/CSRF/
 * password-reset/email-verification), cookies, Authorization headers,
 * or raw form contents as properties — only small, non-sensitive
 * metadata (an enum-like status, a method name, a count).
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!isEnabled) return;

  posthog.capture(eventName, properties);
}
