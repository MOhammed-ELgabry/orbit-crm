# Orbit CRM — International Foundation & Regional Settings

Status: implemented in the working copy; NOT deployed. Nothing here has been
run against a production database, a real Prisma schema engine or a real OAuth
provider (see "What was and was not verified").

## 1. Model

| Concept | Where | Authority |
|---|---|---|
| User location (hints) | `User.regionalHints` (JSON, temporary), `User.timezone` | none — evidence only |
| Company country | `Company.countryCode` | **Owner-confirmed only** |
| Base currency / timezone / default locale | `Company.baseCurrencyCode`, `timezone`, `defaultLocale` | Owner-confirmed only |
| Detection result | `Company.suggested*`, `regionalSource`, `regionalConfidence`, `regionalDetectedAt`, `regionalStatus` | suggestion, never an authority |
| Reference data | `Country` (ISO 3166-1), `Currency` (ISO 4217, **active currencies only**) | seeded, idempotent |

The registration location is not the company's legal country. Legal Entity /
Branch are intentionally not modelled yet (see §9).

## 2. Signals (strongest first)

* **T3 Owner confirmation** — `PUT /regional/settings` (Jwt + Owner + CSRF). Only way `regionalStatus` becomes `CONFIRMED`.
* **T1 GPS (optional, user-consented)** — one-shot `getCurrentPosition` (`enableHighAccuracy`, `maximumAge: 0`, timeout 15 s, never `watchPosition`). Point-in-polygon runs in the browser against bundled Natural Earth 1:10m boundaries. Only `{country, accuracyM, borderRisk}` leaves the function: **no coordinates are sent, stored or logged.** If the accuracy circle (+2 km dataset error budget) touches another country the fix is flagged `borderRisk` and contributes nothing to confidence.
* **T2 IP country (server, local DB)** — `IpCountryService` reads a local MMDB; the IP is used for the lookup only and is never stored or logged. See §5.
* **T0 browser timezone + languages** — helper evidence only.

Confidence (`regional-suggestion.engine.ts`): weights GEOLOCATION 3, IP 2, TIMEZONE (unique) 2, TIMEZONE (shared) 1, LOCALE first 1, other 0.5; HIGH ≥ 4, MEDIUM ≥ 3, else LOW; if the top country leads the runner-up by < 2 the result is `AMBIGUOUS` with **no country**; a conflicting strong signal downgrades one level and forces `NEEDS_REVIEW`. The engine never returns `CONFIRMED`.

## 3. Registration flow

1. SPA collects optional hints (passive signals + optional consented geo result held **in memory only**).
2. `POST /auth/register` accepts `regionalHints` (object, or JSON string in multipart). Validated field by field; invalid parts are dropped, the request is never rejected. Old clients that omit it work unchanged.
3. Hints are stored temporarily on `User` (`regionalHints`, `timezone`).
4. `verifyEmail` transfers them to the Company `suggested*` columns **inside the same transaction** that activates the company, then clears them (`Prisma.DbNull`). A rolled-back transaction keeps the temp data.
5. **Social sign-in:** the register page calls `POST /regional/handoff` (public, throttled 20/min) which validates the hints and returns an opaque 43-char single-use token; only its SHA-256 is stored (`RegionalHintHandoff`, TTL 15 min). The token travels as `?rh=` to `/auth/social/:provider/start`, which sets an HttpOnly cookie `orbit_rh`; the callback consumes it **inside the user/company creation transaction** and clears the cookie. No hint data is ever in a URL and nothing the client sends can be tampered with (a forged token simply matches nothing). A missing/failed token never blocks sign-in.
   *Limitation:* the token is only pre-minted on the Register page; a brand-new user who signs up via the Login page's social buttons gets no hints (they confirm in Settings).

## 4. Money

* `Deal.amount`: `Decimal(12,2)` → `Decimal(19,4)` (15 integer + 4 fractional digits, lossless widening; no currency is back-filled on old rows).
* API takes a decimal **string** (a JSON number that is a plain decimal is also accepted and converted without float math). Exponents, signs, >15 integer / >4 fractional digits are rejected; nothing is rounded.
* `RegionalMoneyService.assertAmountAllowed`: when the company has a base currency, decimals must not exceed its ISO 4217 minor unit (0/2/3/4); with no base currency the legacy 2-decimal rule applies.
* Reports: SQL `moneyText` keeps legacy output (`50.00`) for ≤ 2 decimals and shows 3/4-decimal amounts unrounded.
* Changing an existing base currency when deals exist needs `acknowledgeCurrencyChange=true` (else 409). **No conversion is ever performed.**
* Frontend: `lib/regional/format.ts` is string/BigInt based (`formatMoneyString`, `sumDecimalStrings`, `parseMoneyInput`). The deal form sends a string and refuses extra decimals instead of rounding.

## 5. IP database (Phase 5)

Environment (both optional):

| Variable | Meaning |
|---|---|
| `GEOIP_COUNTRY_DB_PATH` | absolute path to a country-level `.mmdb` (DB-IP Lite "IP to Country", MMDB format). Unset/unreadable ⇒ the IP signal is silently skipped. |
| `CLIENT_IP_HEADER` | e.g. `cf-connecting-ip` when behind Cloudflare. Honoured **only** if the TCP peer is a private/internal address (your Nginx/LB). `X-Forwarded-For` sent by a client is never trusted; the app uses `trust proxy = 1`. |

DB-IP Lite is free (CC BY 4.0, attribution required — the Settings UI shows "IP Geolocation by DB-IP" with a link when the IP source is displayed). It is updated monthly; to refresh, download the new file, replace it on the server and restart the backend (the file is **not** committed to the repo). No paid API is used.

Private, CGNAT, loopback and reserved ranges are excluded from lookup. Accuracy of IP geolocation is limited (VPNs, mobile carriers, corporate egress): it is a weighted signal, never an authority.

## 6. Benchmarks (`benchmarks/*.json`)

* **GPS resolver (real coordinates, 54 countries):** 44/44 city centres correct; 22/24 twin border towns correct, the 2 misses were both flagged `borderRisk` (no silent wrong answer); 11/11 border-risk cases flagged; disputed places never produced a third country.
* **Timezone table (real data):** 549 zones, 510 map to exactly one country; 207/239 default zones unique to a country; Gulf zones are shared (Asia/Riyadh with KW/YE/AQ, Asia/Dubai with OM/RE/SC/TF) ⇒ timezone alone is weak.
* **Decision engine (40 countries, SIMULATED signals — validates logic, not real-world accuracy):** all signals right ⇒ 40/40 HIGH; tz+locale only ⇒ 27 right / 13 ambiguous / 0 wrong; VPN with GPS denied ⇒ 40 AMBIGUOUS, 0 wrong; VPN with truthful GPS ⇒ 40 right but NEEDS_REVIEW.
* **IP DB smoke test:** 9/12 agreed using the npm `@ip-location-db/dbip-country-mmdb` file (3 misses were synthetic MaxMind test vectors and one Google IPv6). This is a sanity check only; **no accuracy claim is made for IP geolocation.**

## 7. Deployment order (nothing below was executed here)

1. Back up the database.
2. Deploy backend code; set optional env vars (`GEOIP_COUNTRY_DB_PATH`, `CLIENT_IP_HEADER`) and place the MMDB file.
3. `npx prisma migrate deploy` — applies `20261109120000_international_regional_foundation` (and `20261107120000_add_lead_conversion` if not yet applied).
4. `npx prisma generate`
5. `npx prisma db seed` (idempotent; calls `syncRegionalReference`, never changes `isActive`).
6. Build and restart backend; build and publish frontend.
7. `frontend/dist` is tracked in this repo: rebuild it (`npm run build`) as part of your normal release; do not hand-edit it.
8. Smoke test: register (with/without hints), social sign-in, Settings → Regional Settings, create a deal with a decimal amount.

Rollback note: the migration is additive except `Deal.amount` widening (`DECIMAL(12,2)` → `DECIMAL(19,4)`), which is lossless; narrowing back is lossless only while no value uses > 2 decimals.

## 8. What was and was not verified

Verified (Linux sandbox, 2026-11-09):

| Check | Result |
|---|---|
| backend `tsc --noEmit` | clean |
| backend `jest` (all 92 suites) | 1403 passed, 3 skipped (the real DB-IP file tests, guarded by `GEOIP_TEST_DB`) |
| frontend `tsc -p tsconfig.app.json` | clean |
| frontend `vitest` (all 78 files) | 884 passed |
| frontend `vite build` | succeeded (boundaries JSON is a lazy chunk: 3.4 MB raw / 1.3 MB gzip) |
| migration SQL, empty DB (whole chain, `psql`) | applied; 250 Country + 154 Currency; `Deal.amount` = numeric(19,4) |
| migration SQL, DB with old data (`psql`) | applied; `12.34 -> 12.3400`, `9999999999.99` and `0` preserved; 0 companies auto-filled with a country/currency; bad status/confidence/currency FK and >15-integer-digit amounts rejected |

Lead Conversion, auth, deals, reports, calendar, notifications, chat, audit and RBAC suites are part of the full runs above and pass.

Pre-existing lint errors in untouched code (e.g. `useChatAttachmentConfig.ts`, deal DTO `@Transform`) were left as they were; the new regional files lint clean.

NOT verified: `prisma migrate` / seed / integration tests against the real Prisma schema engine (engines could not be downloaded in the sandbox); Windows; real Google/Microsoft OAuth redirect; real browsers' permission prompts (jsdom mocks only); production data.

## 9. Future compatibility (Orbit Accounting / Legal Entities)

`Company.countryCode` is the company's *operating* country, not a legal-entity jurisdiction. A future `LegalEntity` table can reference `Country`/`Currency` without changing this schema; `Deal` has no currency column on purpose — add `Deal.currencyCode` (nullable, default = company base) when multi-currency deals are needed, and keep exchange rates in a separate dated table. Branch-level timezones can override `Company.timezone` the same way User timezone overrides it for display.
