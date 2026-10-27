import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

import { BASE_URL, credentials } from './config.js';

// Diagnostics only. A 429 means the pacing in the scenario is too fast for
// the API's rate limits, which is a test-configuration problem, not a result.
export const throttled = new Counter('orbit_throttled_responses');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
export const CSRF_COOKIE = 'orbit_csrf_token';

function noteThrottle(res) {
  if (res.status === 429) {
    throttled.add(1);
  }
}

/**
 * Logs in with the dedicated test user. The API answers with HttpOnly
 * cookies (access/refresh) plus a readable CSRF cookie; k6's per-VU cookie
 * jar stores all three and sends them back automatically, exactly like a
 * browser. No token is read from the body, and nothing is logged.
 */
export function login() {
  const { email, password } = credentials();

  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
    tags: { name: 'POST /auth/login' },
  });
  noteThrottle(res);

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: session cookies set': () => Boolean(csrfToken()),
  });

  if (!ok) {
    // Status only. Never the body, the email or the password.
    console.error(`login failed with status ${res.status}`);
  }

  return ok;
}

/** The double-submit CSRF value, read from the jar like the frontend does. */
export function csrfToken() {
  const cookies = http.cookieJar().cookiesForURL(`${BASE_URL}/`);
  const values = cookies[CSRF_COOKIE];

  return values && values.length > 0 ? values[0] : undefined;
}

/**
 * Ends the session. State-changing and cookie-authenticated, so it must echo
 * the CSRF cookie in X-CSRF-Token (CsrfGuard) — which also proves the
 * header/cookie handshake works under load.
 */
export function logout() {
  const token = csrfToken();

  const res = http.post(`${BASE_URL}/auth/logout`, null, {
    headers: token ? { 'X-CSRF-Token': token } : {},
    tags: { name: 'POST /auth/logout' },
  });
  noteThrottle(res);

  return check(res, { 'logout: status 2xx': (r) => r.status >= 200 && r.status < 300 });
}

/** Authenticated GET using the jar's cookies. `name` groups dynamic URLs. */
export function authedGet(path, name) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { name: `GET ${name}` } });
  noteThrottle(res);

  check(res, { [`${name}: status 200`]: (r) => r.status === 200 });

  return res;
}
