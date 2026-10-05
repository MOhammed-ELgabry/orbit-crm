
# Orbit CRM: Local Development Setup (Windows)

Goal: run Orbit CRM completely on your own machine, with no connection to production.

Repository layout used in this guide:

```text
orbit-crm/
├── apps/
│   ├── backend/      NestJS + Prisma
│   └── frontend/     React + Vite
├── scripts/
│   └── setup-local.ps1
└── ...
```

| Part | Local address / value |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 (Swagger: http://localhost:3000/docs) |
| PostgreSQL | host `localhost`, port `5432`, role `postgres`, database `orbitcrm`, schema `public` |
| Mailpit SMTP | 127.0.0.1:1025 |
| Mailpit web UI | http://localhost:8025 |

Use PowerShell. Steps 1 to 7 set things up; the LOCAL VERIFICATION section at the end checks them.

Rules for this setup:
- Never copy production values (database URL, JWT secrets, OAuth secrets, mail credentials, Sentry or PostHog keys) into any local file.
- Never commit `apps/backend/.env` or `apps/frontend/.env.local`.
- Never run `prisma db push` or `prisma migrate reset`. Use `prisma migrate deploy` only.
- Never drop, truncate or recreate a database. Do not create other PostgreSQL roles or databases for this setup, and do not change PostgreSQL's configuration or passwords.
- Do not touch the production server.
- OAuth, Sentry and PostHog stay disabled locally (their variables are simply not set).

---

## 1. Install the tools

1. **Node.js 22 LTS** from https://nodejs.org. Node 22 LTS is the version used and tested locally for this setup (`node -v` prints `v22.x.x`). The repository files reviewed do not pin a Node version (no `engines` field). The frontend tool Vite 8 itself needs Node 20.19+ or 22.12+.
2. **Git** from https://git-scm.com.
3. **PostgreSQL** from https://www.postgresql.org/download/windows/ (this setup was tested with PostgreSQL 16). Keep port `5432`. During installation you choose the password of the `postgres` role; remember it. This guide never changes it.
4. **Mailpit**: download `mailpit-windows-amd64.zip` from https://github.com/axllent/mailpit/releases/latest and extract it to `C:\tools\mailpit\` (so that `C:\tools\mailpit\mailpit.exe` exists). Mailpit is only a local tool; it is not added to any `package.json`.

Each app is installed from its own folder (`apps\backend` and `apps\frontend` each have their own `package.json` and `package-lock.json`). No root-level workspaces are assumed: if the repository root also has a `package.json`, check it before running the commands below.

## 2. Git safety (do this before creating any .env file)

Run from the repository root (replace the path):

```powershell
Set-Location "C:\path\to\orbit-crm"

if (-not (Test-Path .gitignore)) { New-Item .gitignore -ItemType File | Out-Null }
if (-not (Select-String -Path .gitignore -Pattern '^!\.env\.local\.example\s*$' -Quiet)) {
  Add-Content -Path .gitignore -Value @(
    '',
    '# Orbit local environment files (never commit secrets)',
    '.env',
    '.env.*',
    '!.env.example',
    '!.env.local.example'
  )
}

git ls-files | Select-String '(^|/)\.env'
```

The first block only adds the rules when they are missing and never removes existing ones. If your `.gitignore` already contains these rules, nothing changes.

What the last command should print:
- Example files such as `.env.example` and `.env.local.example` MAY be listed. They are templates and can be tracked by git.
- Real environment files (`.env`, `.env.local`) must NOT be listed. If one is listed, STOP: it is already tracked by git.

## 3. PostgreSQL (existing local setup)

This project uses the local PostgreSQL role that already exists: `postgres`. No new role is created, no password is changed, and no PostgreSQL setting is changed.

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Role | `postgres` |
| Database | `orbitcrm` |
| Schema | `public` |

**3.1 Check whether the database already exists (read-only):**

```powershell
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
& $psql -U postgres -h localhost -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'orbitcrm'"
```

Adjust the `16` in the path if your installed version differs. `psql` asks for the `postgres` password (it is not stored or changed).

- It prints `1`: the database `orbitcrm` already exists. Do nothing and go to section 4.
- It prints nothing: the database does not exist yet. Do 3.2.

**3.2 Create the database (only if 3.1 printed nothing):**

```powershell
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
& $psql -U postgres -h localhost -d postgres -c "CREATE DATABASE orbitcrm;"
```

Expected: `CREATE DATABASE`. If PostgreSQL answers that the database already exists, nothing was changed. Never drop or recreate an existing `orbitcrm`: it may contain your data.

The test database for later work is a separate step and is not part of this guide.

## 4. Start Mailpit

Open a NEW PowerShell window and leave it open:

```powershell
C:\tools\mailpit\mailpit.exe --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025
```

Expected: lines saying SMTP starts on `127.0.0.1:1025` and the web UI on `127.0.0.1:8025`. Open http://localhost:8025 (empty inbox).
If Windows SmartScreen blocks it: More info, then Run anyway (only if you downloaded it from the official releases page).

## 5. Environment files

| File | What it is |
|---|---|
| `apps/backend/.env` | The real local backend configuration. This is the file the backend reads. Never committed. |
| `apps/frontend/.env.local` | The real local frontend configuration. This is the file Vite reads. Never committed. |
| `apps/backend/.env.local.example` | Template and documentation only. The application does not read it, and `setup-local.ps1` does not depend on it. |
| `apps/frontend/.env.local.example` | Template and documentation only, same as above. |

`scripts/setup-local.ps1` prepares the two real files safely. From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
```

To only inspect, without creating anything:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 -CheckOnly
```

What the script does:
- **Never modifies an existing file.** If `apps/backend/.env` or `apps/frontend/.env.local` already exists, it is only inspected (read-only) and reported on. To fix a problem in an existing file, edit the file yourself.
- **Creates a file only when it is missing,** and only when git is verified to ignore it and it is not tracked. Nothing is ever overwritten.
- When it creates `apps/backend/.env`, it asks (hidden input) for the password of the PostgreSQL role `postgres`, writes a `DATABASE_URL` for `localhost:5432/orbitcrm` with `?schema=public` (special characters in the password are encoded for you), sets `NODE_ENV=development`, points mail to Mailpit (`127.0.0.1:1025`), and generates two different random JWT secrets.
- When it creates `apps/frontend/.env.local`, it sets `VITE_API_BASE_URL=http://localhost:3000`.
- **Never prints** the database password or the JWT secrets.
- Does not run Prisma or migrations, does not write to the database, and does not install anything. It only opens plain TCP connections to `127.0.0.1` ports 5432, 1025 and 8025 to see whether PostgreSQL and Mailpit are listening (no login, no queries).

What it checks in an existing `apps/backend/.env`:

| Result | Conditions |
|---|---|
| `[FAIL]` | A required variable is missing or empty (`NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `FRONTEND_URL`); `NODE_ENV` is not exactly `development`; the database host is not local; the database name is not `orbitcrm`; the database role is not `postgres`; `MAIL_HOST` is not local; the two JWT secrets are identical |
| `[WARN]` | The database port is not `5432`; `DATABASE_URL` has a schema other than `public`, or cannot be parsed; `MAIL_PORT` is not `1025`; `FRONTEND_URL` is not `http://localhost:5173`; a JWT secret is shorter than 32 characters; a deployed-environment setting is present (`SENTRY_DSN`, `COOKIE_DOMAIN`, Google/Facebook/Microsoft secrets, `SOCIAL_AUTH_STATE_SECRET`) |

In an existing `apps/frontend/.env.local`: `[FAIL]` if `VITE_API_BASE_URL` is missing, empty or not a local address; `[WARN]` if it is local but not `http://localhost:3000`, or if Sentry/PostHog variables are set.

Git checks: `[FAIL]` if an environment file is not ignored by git, is tracked by git, or if git is needed but not available. `[WARN]` if this is not a git repository, or if a `.example` file is ignored (the examples are meant to be committed).

Prerequisites: `[WARN]` if nothing is listening on PostgreSQL's port 5432 or Mailpit's SMTP port 1025.

Result lines:
- `[ OK ]` the check passed. `[info]` information only.
- `[WARN]` something differs from the expected local setup or a prerequisite is not running. Review it; it does not make the script fail.
- `[FAIL]` something is unsafe or wrong for this local setup. The script finishes with exit code 1. Nothing is changed for you: fix the file yourself (or the git rules) and run the script again.

Exit codes:
- `exit 0`: no `[FAIL]`. Warnings may be present.
- `exit 1`: at least one `[FAIL]`, or the script stopped early (for example the `apps\backend` and `apps\frontend` folders were not found, or an empty password was entered).

Check that git does not see the real files (prints no values):

```powershell
git status --short
```

Expected: `apps/backend/.env` and `apps/frontend/.env.local` do NOT appear. If they appear, do not continue.

## 6. Install, generate, migrate

From the repository root:

```powershell
Set-Location apps\backend
npm ci
npx prisma generate
npx prisma migrate deploy
Set-Location ..\frontend
npm ci
Set-Location ..\..
```

`migrate deploy` only applies migrations that are not applied yet. It never resets, drops or empties anything. The first lines it prints name the datasource: **check that it says database `orbitcrm`** before going on. The project currently has 27 migrations (the number grows as the project grows). Two normal outcomes:

- **There are pending migrations** (a new empty database, or new migrations were added): Prisma applies them, one by one, and ends with a message that all migrations were applied successfully.
- **The database is already up to date:** Prisma reports that there are no pending migrations to apply and changes nothing.

(The exact wording may differ slightly between Prisma versions.) A warning that `package.json#prisma` is deprecated is harmless.

## 7. Start the backend and the frontend

Backend (own PowerShell window, leave open):

```powershell
Set-Location apps\backend
npm run start:dev
```

Expected: `Nest application successfully started`.

Frontend (another PowerShell window, leave open):

```powershell
Set-Location apps\frontend
npm run dev -- --host localhost --port 5173 --strictPort
```

Expected: `Local: http://localhost:5173/`. The `--strictPort` flag makes it fail instead of silently moving to another port (which would break CORS).

Always open the app at **http://localhost:5173**, never `127.0.0.1:5173`.

---

## LOCAL VERIFICATION

Do these in order. Stop and report at the first failure. Request limits that can show up while testing: register 5 and login 5 per minute, verify-email 10 per minute, resend-verification 3 per 15 minutes. A `429` means wait and retry.

1. **Backend on localhost:3000**
```powershell
   (Invoke-WebRequest http://localhost:3000/docs -UseBasicParsing).StatusCode
```
   Expected: `200`.

2. **Swagger on /docs**: open http://localhost:3000/docs in the browser. Expected: the Swagger UI lists the API (for example the `auth` routes). Swagger is available because `NODE_ENV` is `development`.

3. **Frontend on localhost:5173**: open http://localhost:5173. Expected: the registration page (`/` shows `RegisterPage`).

4. **The frontend uses the local API**

Open the browser DevTools → Network tab, then reload the frontend at `http://localhost:5173`.

Perform any action that makes an API request, such as opening the login/register flow.

Expected: API requests go to `http://localhost:3000`.

If any API request goes to `162.35.172.155`, stop and report it. Do not enter real credentials or continue testing.


5. **No request to 162.35.172.155**: open DevTools, Network tab, enable "Preserve log", type `162.35` in the filter, then use the app for the steps below. Expected: nothing is listed. All API calls go to `localhost:3000`. If ANY request appears, stop, do not enter data, and report it.

6. **Register**: on the registration page fill in your name, a fake email address such as `owner1@example.test`, a strong password and the **company name** (the company name is entered here, during registration). Expected: the app moves to the email verification page.

7. **Verification email arrives in Mailpit**: open http://localhost:8025. Expected: a new message for that address with a 6-digit code. The code is valid for 10 minutes. If it is lost or expired, request a new one with the resend option (limited to 3 per 15 minutes).

8. **Email verification**: enter the code. Expected: verification succeeds and you are taken to `/industry-selection`. Choose a **Business Type**. Expected: you then reach the Dashboard.

9. **Protected Dashboard**: while logged in, the Dashboard loads. Then open a private/incognito window and go to http://localhost:5173/dashboard. Expected: you are redirected to the login page and the Dashboard is not shown.

10. **Login**: log out, then log in again with the same email and password. Expected: you reach the Dashboard.

11. **Cookies**: DevTools, Application, Cookies, `localhost`. Expected after login:
    - `orbit_access_token` (HttpOnly)
    - `orbit_refresh_token` (HttpOnly, path `/auth`)
    - `orbit_csrf_token` (NOT HttpOnly; the frontend reads it and sends it back in a header)
    - In development `Secure` is not set (plain http) and SameSite is `Lax`.

12. **CSRF**: in Network, click the `logout` request (or any POST after login). Expected: the request has the header `X-CSRF-Token` with the same value as the `orbit_csrf_token` cookie. Negative test without cookies or header:
```powershell
    try { Invoke-WebRequest -Method Post http://localhost:3000/auth/logout -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
```
    Expected: `403`. A `2xx` answer means CSRF is not enforced: stop and report.

13. **Logout**: click logout. Expected: you return to the login page and the three `orbit_*` cookies are removed or emptied. Opening a protected page then redirects to login.

If all steps pass, the local environment is working. Do not start any other work on top of it until this is confirmed.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `psql` not recognized | Use the full path, for example `C:\Program Files\PostgreSQL\16\bin\psql.exe` (adjust the version folder). |
| Prisma `P1000` (authentication failed) | The password in `apps\backend\.env` is not the password of the PostgreSQL role `postgres`. Edit `apps\backend\.env` yourself and correct the password inside `DATABASE_URL` (special characters must be percent-encoded, for example `@` becomes `%40`). `setup-local.ps1` does not edit an existing file, and you should not change the `postgres` password for this. |
| Prisma `P1003` or "database `orbitcrm` does not exist" | The database is missing. Follow section 3.1 and 3.2. |
| Prisma `P1001` (cannot reach the server) | PostgreSQL is not running: start the PostgreSQL service in Windows Services, and check that `DATABASE_URL` uses `localhost:5432`. |
| `Config validation error: "X" is required` | `apps\backend\.env` is missing variable X. Run `setup-local.ps1 -CheckOnly` to see which, then add it yourself. |
| `setup-local.ps1` prints `[FAIL]` | Read the message. It names the file and the problem (for example `NODE_ENV` is not `development`, or the database is not `orbitcrm`). Fix the file by hand and run the script again. |
| `EADDRINUSE` | Port 3000 or 5173 is busy: `netstat -ano \| findstr :3000`. |
| Register returns 500 | Mailpit is not running. The half-created user stays; use a new email address. |
| CORS errors in the console | The frontend was opened at an address other than `http://localhost:5173`, or `FRONTEND_URL` in `apps\backend\.env` is different. |
| Script blocked by execution policy | Use the exact command from section 5 (`-ExecutionPolicy Bypass` applies only to that run). |
| `429 Too Many Requests` | A rate limit was hit (login/register 5 per minute, verify-email 10 per minute, resend-verification 3 per 15 minutes): wait and retry. |