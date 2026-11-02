
import { sleep } from 'k6';

import { COMMON_THRESHOLDS, LIMITS, intFromEnv } from '../lib/config.js';
import { authedGet, login, logout } from '../lib/session.js';

const perMinute = intFromEnv('K6_LOGIN_RATE_PER_MIN', 4, {
  max: LIMITS.loginPerMinute,
});
const minutes = intFromEnv('K6_DURATION_MINUTES', 2, { max: 10 });

export const options = {
  scenarios: {
    login: {
      executor: 'constant-arrival-rate',
      rate: perMinute,
      timeUnit: '1m',
      duration: `${minutes}m`,
      preAllocatedVUs: 2,
      maxVUs: 4,
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:POST /auth/login}': ['p(95)<2000'],
    'http_req_duration{name:GET /auth/me}': ['p(95)<1000'],
    'http_req_duration{name:POST /auth/logout}': ['p(95)<1000'],
  },
};

export default function () {
  if (!login()) {
    return;
  }

  authedGet('/auth/me', '/auth/me');
  sleep(1);
  logout();
}
