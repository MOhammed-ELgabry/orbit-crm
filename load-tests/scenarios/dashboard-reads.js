// What the Dashboard and Reports pages read after sign-in: one login per VU,
// then paced rounds of GET requests with the session cookies, then logout.
// Read-only: no data is created or changed.
//
//   K6_EMAIL=... K6_PASSWORD=... k6 run load-tests/scenarios/dashboard-reads.js
import { sleep } from 'k6';

import { COMMON_THRESHOLDS, LIMITS, intFromEnv } from '../lib/config.js';
import { authedGet, login, logout } from '../lib/session.js';

const vus = intFromEnv('K6_VUS', 2, { max: LIMITS.readVus });
const rounds = intFromEnv('K6_ROUNDS', 8, { max: 40 });
// Each route has its own 30/min (15/min for /auth/me) bucket per client IP,
// shared by every VU on the load generator. 15 s between rounds with up to 3
// VUs is at most 12 requests/min per route.
const pauseSeconds = intFromEnv('K6_PAUSE_SECONDS', 15, { min: 15, max: 120 });

export const options = {
  scenarios: {
    dashboardReads: {
      executor: 'per-vu-iterations',
      vus,
      iterations: 1,
      maxDuration: `${Math.ceil((rounds * (pauseSeconds + 3)) / 60) + 2}m`,
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    http_req_duration: ['p(95)<1500'],
    'http_req_duration{name:GET /reports/pipeline-snapshot}': ['p(95)<2000'],
    'http_req_duration{name:GET /reports/leads-overview}': ['p(95)<2000'],
    'http_req_duration{name:GET /reports/tasks-overview}': ['p(95)<2000'],
  },
};

function isoDate(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export default function () {
  if (!login()) {
    return;
  }

  const period = `from=${isoDate(30)}&to=${isoDate(0)}&timezone=UTC`;

  for (let round = 0; round < rounds; round += 1) {
    authedGet('/auth/me', '/auth/me');

    // Pages' list reads (tenant comes from the session, never the URL).
    authedGet('/leads?page=1&limit=20', '/leads');
    authedGet('/tasks?page=1&limit=20', '/tasks');
    authedGet('/deals?page=1&limit=20', '/deals');
    authedGet('/contacts?page=1&limit=20', '/contacts');

    // Reports (Recharts data).
    authedGet(`/reports/pipeline-snapshot?${period}`, '/reports/pipeline-snapshot');
    authedGet(`/reports/leads-overview?${period}`, '/reports/leads-overview');
    authedGet(`/reports/tasks-overview?${period}`, '/reports/tasks-overview');

    sleep(pauseSeconds);
  }

  logout();
}
