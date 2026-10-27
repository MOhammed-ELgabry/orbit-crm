// Availability smoke: GET / (the app's only unauthenticated endpoint) at a
// steady, low rate. Needs no credentials.
//
//   k6 run load-tests/scenarios/health.js
import http from 'k6/http';
import { check } from 'k6';

import { BASE_URL, COMMON_THRESHOLDS, LIMITS, intFromEnv } from '../lib/config.js';

const perMinute = intFromEnv('K6_HEALTH_RATE_PER_MIN', 20, { max: LIMITS.healthPerMinute });
const minutes = intFromEnv('K6_DURATION_MINUTES', 2, { max: 10 });

export const options = {
  scenarios: {
    health: {
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
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`, { tags: { name: 'GET /' } });

  check(res, { 'health: status 200': (r) => r.status === 200 });
}
