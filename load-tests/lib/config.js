// Shared configuration and the safety guard for every Orbit CRM k6 scenario.
//
// These tests are for LOCAL and STAGING only. The guard below runs when a
// scenario is loaded (k6's "init" stage), so an unsafe target stops the run
// before a single request is sent.

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Hosts that must never be load-tested, whatever else is configured. The
// first one is the API fallback that is hardcoded in frontend/src/services/api.ts,
// i.e. the deployed API; it is treated as Production until the owner says otherwise.
const ALWAYS_DENIED_HOSTS = ['162.35.172.155'];

function hostOf(url) {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  if (!match) {
    throw new Error(`K6_BASE_URL must start with http:// or https:// (got "${url}").`);
  }
  // Drop credentials and the port: "user:pw@host:3000" -> "host".
  const authority = match[1].replace(/^.*@/, '');
  return authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1).toLowerCase()
    : authority.replace(/:\d+$/, '').toLowerCase();
}

function list(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function resolveTarget() {
  const baseUrl = (__ENV.K6_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const targetEnv = (__ENV.K6_TARGET_ENV || 'local').toLowerCase();
  const host = hostOf(baseUrl);

  if (targetEnv !== 'local' && targetEnv !== 'staging') {
    throw new Error(
      `Refusing to run: K6_TARGET_ENV must be "local" or "staging" (got "${targetEnv}"). ` +
        'Load tests never run against Production.',
    );
  }

  if (ALWAYS_DENIED_HOSTS.includes(host) || list(__ENV.K6_DENY_HOSTS).includes(host)) {
    throw new Error(`Refusing to run: host "${host}" is on the deny list (treated as Production).`);
  }

  if (targetEnv === 'local') {
    if (!LOCAL_HOSTS.includes(host)) {
      throw new Error(
        `Refusing to run: K6_TARGET_ENV=local needs a localhost URL (got host "${host}"). ` +
          'For a staging server set K6_TARGET_ENV=staging and see README.md.',
      );
    }
  } else {
    // Staging must be named explicitly, twice: an allow-list entry for the
    // exact host and a confirmation flag. A typo or a copied production URL
    // therefore fails closed.
    if (!list(__ENV.K6_ALLOWED_HOSTS).includes(host)) {
      throw new Error(
        `Refusing to run: staging host "${host}" is not in K6_ALLOWED_HOSTS. ` +
          'List the exact staging host there (comma separated).',
      );
    }
    if (__ENV.K6_CONFIRM_STAGING !== 'yes') {
      throw new Error('Refusing to run: set K6_CONFIRM_STAGING=yes to confirm this is a staging server.');
    }
  }

  return { baseUrl, targetEnv, host };
}

export const TARGET = resolveTarget();
export const BASE_URL = TARGET.baseUrl;

// Credentials come from the environment only: never from the repo, never
// printed, never sent as a tag. Use a dedicated, verified load-test user in a
// dedicated staging company.
export function credentials() {
  const email = __ENV.K6_EMAIL;
  const password = __ENV.K6_PASSWORD;

  if (!email || !password) {
    throw new Error('K6_EMAIL and K6_PASSWORD are required for this scenario (a dedicated test user).');
  }

  return { email, password };
}

// The API throttles per client IP and per route (see ThrottlerModule in
// backend/src/modules/app/app.module.ts and @Throttle on AuthController):
//   default 30/min, login 5/min, logout 5/min, /auth/me 15/min.
// Every scenario is paced under those limits, and the knobs below are
// clamped so a typo cannot turn a test into a throttling or DoS test.
export const LIMITS = {
  healthPerMinute: 25,
  loginPerMinute: 4,
  readVus: 3,
};

export function intFromEnv(name, fallback, { min = 1, max }) {
  const raw = __ENV[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max} (got "${raw}").`);
  }

  return value;
}

// Conservative on purpose: they should hold on a small staging box and flag
// real regressions, not fail on noise. Tighten them from measured baselines.
export const COMMON_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
};
