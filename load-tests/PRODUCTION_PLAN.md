# Production load testing — plan only (not executable, not approved)

Nothing in this repository runs load against Production, and the scenarios
refuse to. This is a checklist for a future, separately approved exercise.

## Preconditions (all required)

1. Written approval from the owner naming the date, window, target and maximum load.
2. A staging environment with production-like size and data volume has already
   been tested and its results reviewed. Production is never the first place a
   scenario runs.
3. A tested rollback/stop plan, an on-call owner watching error rate, p95
   latency, CPU, DB connections and the PostgreSQL slow-query log, and a named
   person who can stop the test at once.
4. A dedicated test company and user created for the purpose, no real customer
   data touched, and a cleanup plan for anything created.
5. A decision on rate limiting: the API throttles per client IP. Raising the
   load would require either many source IPs or a temporary, reviewed
   allow-list. Neither is configured here and weakening the throttler is out
   of scope.
6. Email, push and webhook side effects confirmed absent or sandboxed.
   Read-only scenarios only for a first run.

## If approved, the shape of a run

- Start from `dashboard-reads.js` with the default pacing, off-peak, a few
  minutes, 1–2 VUs. Increase one step at a time and only after reviewing the
  previous step's metrics.
- Abort immediately on: `http_req_failed` > 1 %, any 5xx burst, p95 above twice
  the staging baseline, rising DB connection count, or any customer report.
- Record results, compare with the staging baseline and remove the test user
  and data afterwards.

## Explicitly out of scope

Write-heavy scenarios, login-throttle or credential-stuffing style tests,
uploads (avatar or contact import), anything on the Book-Shop project, and any
change to Nginx, PM2 or server configuration.
