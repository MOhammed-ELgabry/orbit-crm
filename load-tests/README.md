# Orbit CRM — k6 load tests (Local / Staging only)

Small, conservative k6 scenarios for the Orbit API. They are paced **under the
API's own rate limits**, so they measure latency and correctness of the cookie
session, not how much traffic the throttler lets through.

> **Never run these against Production.** The scripts refuse to start unless
> the target is `localhost` or an explicitly allow-listed staging host. See
> [`PRODUCTION_PLAN.md`](./PRODUCTION_PLAN.md) for what a production exercise
> would need; nothing in this folder runs one.

## Scenarios

| File | What it does | Needs credentials |
| --- | --- | --- |
| `scenarios/health.js` | `GET /` (the only public endpoint) at ≤ 25 req/min | no |
| `scenarios/login.js` | `POST /auth/login` → `GET /auth/me` → `POST /auth/logout` at ≤ 4 logins/min | yes |
| `scenarios/dashboard-reads.js` | One login per VU, then paced rounds of the reads the Dashboard/Reports pages make (`/auth/me`, `/leads`, `/tasks`, `/deals`, `/contacts`, three `/reports/*`), then logout. Read-only | yes |

Shared code: `lib/config.js` (target safety guard, limits, thresholds) and
`lib/session.js` (login, CSRF, logout, authenticated GET).

## How the API's security is respected

- **HttpOnly cookies.** Login returns the access/refresh cookies; k6's per-VU
  cookie jar stores and re-sends them like a browser. No token is read from a
  response body.
- **CSRF.** State-changing cookie-authenticated calls need the
  `orbit_csrf_token` cookie echoed in `X-CSRF-Token`. `logout()` reads it from
  the jar and sends it, so the handshake is exercised on every run. A
  scenario that creates or edits data would have to do the same.
- **Throttling** (`ThrottlerModule`, per client IP per route): default 30/min,
  login 5/min, logout 5/min, `/auth/me` 15/min. Rates and pauses are clamped
  (`LIMITS` in `lib/config.js`); out-of-range values stop the run. Every
  `429` is counted in `orbit_throttled_responses` and also fails
  `http_req_failed`, because it means the pacing is wrong, not that the API is.
  All VUs on one machine share one IP, so do not add VUs to "go faster".
- **No secrets.** Credentials come only from `K6_EMAIL` / `K6_PASSWORD`. Scripts
  never print them or response bodies (failures log the status code only) and
  never use them in tags. Use a **dedicated, verified test user in a dedicated
  test company**, never a real customer's account. Do not use `--http-debug`,
  it prints headers and cookies.

## Running

Install k6 from <https://grafana.com/docs/k6/latest/set-up/install-k6/>. Set
`K6_NO_USAGE_REPORT=true` if outbound traffic is restricted.

### Local (API running on your machine)

```bash
export K6_BASE_URL=http://localhost:3000     # default
export K6_EMAIL=loadtest@example.test        # a test user in your LOCAL database
export K6_PASSWORD='...'                     # from your shell, never a file in git

k6 run load-tests/scenarios/health.js
k6 run load-tests/scenarios/login.js
k6 run load-tests/scenarios/dashboard-reads.js
```

### Staging

A staging host must be named explicitly **and** confirmed, otherwise the run
is refused:

```bash
export K6_TARGET_ENV=staging
export K6_BASE_URL=https://<your-staging-api-host>
export K6_ALLOWED_HOSTS=<your-staging-api-host>   # exact host, comma separated
export K6_CONFIRM_STAGING=yes
```

Only do this against a server you own that holds no production data, and
tell whoever else uses it. Cookies are `Secure` when the API runs with
`NODE_ENV=production`, so use the `https://` URL there.

## Knobs (all optional)

| Variable | Default | Allowed | Meaning |
| --- | --- | --- | --- |
| `K6_DURATION_MINUTES` | 2 | 1–10 | health / login duration |
| `K6_HEALTH_RATE_PER_MIN` | 20 | 1–25 | health requests per minute |
| `K6_LOGIN_RATE_PER_MIN` | 4 | 1–4 | logins per minute |
| `K6_VUS` | 2 | 1–3 | dashboard-reads virtual users |
| `K6_ROUNDS` | 8 | 1–40 | read rounds per VU |
| `K6_PAUSE_SECONDS` | 15 | 15–120 | pause between read rounds |
| `K6_DENY_HOSTS` | — | list | extra hosts to refuse |

## Thresholds

Deliberately loose so they catch regressions rather than noise:
`http_req_failed < 1 %`, `checks > 99 %`, p95 health < 500 ms, login < 2 s
(password hashing), `/auth/me` and logout < 1 s, reads < 1.5 s, reports < 2 s.
Tighten them from your own measured baseline. Save a result with
`k6 run --summary-export=summary.json ...` (the summary has metrics only, no
credentials) and keep it out of git.

## What was and was not verified

The scripts were run with k6 v0.55.0 against a small local stand-in server
(not the real API) to prove the scripts, guards, cookie jar and CSRF header
work. **No run against the real Orbit API, a real database or a staging
server has been done**; real latency numbers must come from you.
