<#
.SYNOPSIS
  Safe, idempotent LOCAL environment-file helper for Orbit CRM (Windows / PowerShell).

.DESCRIPTION
  Works with the existing local setup:
    apps\backend\.env          (PostgreSQL role "postgres", database "orbitcrm", ?schema=public)
    apps\frontend\.env.local   (VITE_API_BASE_URL=http://localhost:3000)

  What it does
    - If an environment file already exists it is NEVER modified. It is only
      inspected (read-only) and a report is printed. For apps\backend\.env the
      report FAILS unless NODE_ENV is exactly 'development', the database is
      'orbitcrm' and the role is 'postgres' (on a local host).
    - If an environment file is missing it is created (only when git is
      verified to ignore it), with random local JWT secrets.
    - Prints key names and non-secret facts only. It never prints the
      database password or the JWT secrets.

  What it never does
    - No database access of any kind, no Prisma commands, no migrations.
    - No DROP / TRUNCATE / reset / db push.
    - No Docker, no installs, no changes to application code or git.

.PARAMETER CheckOnly
  Inspect only. Create nothing, even when a file is missing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 -CheckOnly
#>
[CmdletBinding()]
param(
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------
# Expected LOCAL values (the setup that already works)
# ---------------------------------------------------------------------
$DbHost       = 'localhost'
$DbPort       = 5432
$DbName       = 'orbitcrm'
$DbRole       = 'postgres'
$DbSchema     = 'public'
$BackendUrl   = 'http://localhost:3000'
$FrontendUrl  = 'http://localhost:5173'
$MailHost     = '127.0.0.1'
$MailPort     = 1025
$MailUiPort   = 8025
$LocalHosts   = @('localhost', '127.0.0.1', '::1', '[::1]')

$BackendRel   = 'apps/backend/.env'
$FrontendRel  = 'apps/frontend/.env.local'
$BackendExRel = 'apps/backend/.env.local.example'
$FrontendExRel = 'apps/frontend/.env.local.example'

$script:Problems = 0
$script:Warnings = 0

function Write-Section { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Info    { param([string]$Text) Write-Host "  [info] $Text" }
function Write-Pass    { param([string]$Text) Write-Host "  [ OK ] $Text" -ForegroundColor Green }
function Write-Warn    { param([string]$Text) $script:Warnings++; Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Problem { param([string]$Text) $script:Problems++; Write-Host "  [FAIL] $Text" -ForegroundColor Red }

function Stop-Setup {
    param([string]$Message)
    Write-Host ''
    Write-Host "STOPPED: $Message" -ForegroundColor Red
    exit 1
}

function New-RandomHex {
    param([int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
}

# Creates a NEW file (UTF-8, no BOM). CreateNew fails if the file already
# exists, so an existing file can never be overwritten by this function.
function Write-NewFile {
    param([string]$Path, [string]$Content)
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($Content)
    $stream = New-Object System.IO.FileStream(
        $Path,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}

function Read-EnvFile {
    param([string]$Path)
    $map = @{}
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and
                (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                 ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $map[$Matches[1]] = $value
        }
    }
    return $map
}

function Test-TcpPort {
    param([string]$HostName, [int]$Port, [int]$TimeoutMs = 1000)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        if ($async.AsyncWaitHandle.WaitOne($TimeoutMs, $false) -and $client.Connected) {
            $client.EndConnect($async)
            return $true
        }
        return $false
    }
    catch { return $false }
    finally { $client.Close() }
}

# ---------------------------------------------------------------------
# 1. Layout
# ---------------------------------------------------------------------
Write-Section 'Repository layout'

$repoRoot    = Split-Path -Parent $PSScriptRoot
$backendDir  = Join-Path $repoRoot 'apps\backend'
$frontendDir = Join-Path $repoRoot 'apps\frontend'

foreach ($dir in @($backendDir, $frontendDir)) {
    if (-not (Test-Path -LiteralPath (Join-Path $dir 'package.json') -PathType Leaf)) {
        Stop-Setup "Expected apps\backend and apps\frontend (each with a package.json) under: $repoRoot. This script must live in <repo>\scripts\."
    }
}
Write-Pass "Repository root: $repoRoot"
Write-Pass 'Found apps\backend and apps\frontend'

$backendEnv  = Join-Path $backendDir  '.env'
$frontendEnv = Join-Path $frontendDir '.env.local'

if ($CheckOnly) { Write-Info 'Mode: CheckOnly (nothing will be created).' }

# ---------------------------------------------------------------------
# 2. Git safety
# ---------------------------------------------------------------------
Write-Section 'Git safety'

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$hasGitDir  = Test-Path -LiteralPath (Join-Path $repoRoot '.git')
$gitReady   = ($null -ne $gitCommand) -and $hasGitDir

function Test-GitIgnored {
    param([string]$RelativePath)
    & git -C $repoRoot check-ignore -q -- $RelativePath
    return ($LASTEXITCODE -eq 0)
}

function Test-GitTracked {
    param([string]$RelativePath)
    $listed = & git -C $repoRoot ls-files -- $RelativePath
    return [bool]$listed
}

$ignoredState = @{}
if ($gitReady) {
    foreach ($rel in @($BackendRel, $FrontendRel)) {
        $ignored = Test-GitIgnored $rel
        $ignoredState[$rel] = $ignored
        if ($ignored) { Write-Pass "$rel is ignored by git" }
        else { Write-Problem "$rel is NOT ignored by git. Add these rules to .gitignore: .env  .env.*  !.env.example  !.env.local.example" }

        if (Test-GitTracked $rel) {
            Write-Problem "$rel is TRACKED by git (secrets could reach the remote). Untrack it before continuing."
        }
    }
    foreach ($rel in @($BackendExRel, $FrontendExRel)) {
        if (Test-Path -LiteralPath (Join-Path $repoRoot $rel)) {
            if (Test-GitIgnored $rel) { Write-Warn "$rel is ignored by git; the example files are meant to be committed (rule '!.env.local.example' missing?)." }
        }
    }
}
elseif ($hasGitDir) {
    Write-Problem 'This is a git repository but the git command is not available, so ignore rules cannot be verified.'
}
else {
    Write-Warn 'Not a git repository (no .git folder): ignore rules were not checked.'
}

function Test-CanCreate {
    param([string]$RelativePath)
    if ($CheckOnly) { return $false }
    if ($gitReady) {
        if (-not $ignoredState[$RelativePath]) { return $false }
        if (Test-GitTracked $RelativePath)     { return $false }
    }
    elseif ($hasGitDir) { return $false }
    return $true
}

# ---------------------------------------------------------------------
# 3. Backend: apps\backend\.env
# ---------------------------------------------------------------------
Write-Section "Backend: $BackendRel"

$RequiredBackendKeys = @(
    'NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
    'ACCESS_TOKEN_EXPIRES_IN', 'REFRESH_TOKEN_EXPIRES_IN',
    'MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASSWORD', 'MAIL_FROM',
    'FRONTEND_URL'
)

if (Test-Path -LiteralPath $backendEnv) {
    Write-Info 'File exists: it will NOT be modified. Read-only inspection follows (no values are printed except non-secret facts).'
    $cfg = Read-EnvFile $backendEnv

    $missing = @($RequiredBackendKeys | Where-Object { -not $cfg.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($cfg[$_]) })
    if ($missing.Count -gt 0) { Write-Problem ('Missing or empty required variable(s): ' + ($missing -join ', ') + '. Add them yourself; this script will not edit an existing file.') }
    else { Write-Pass 'All required variables are present' }

    # NODE_ENV must be exactly "development" (a missing or empty value was already reported above).
    if ($cfg.ContainsKey('NODE_ENV') -and -not [string]::IsNullOrWhiteSpace($cfg['NODE_ENV'])) {
        if ($cfg['NODE_ENV'] -cne 'development') {
            Write-Problem "NODE_ENV is '$($cfg['NODE_ENV'])'. It must be exactly 'development' for this local setup."
        }
        else { Write-Pass 'NODE_ENV is development' }
    }

    # DATABASE_URL (password is never printed)
    if ($cfg.ContainsKey('DATABASE_URL')) {
        $dbPattern = '^postgres(?:ql)?://(?<user>[^:@/]+)(?::(?<pw>[^@]*))?@(?<host>[^:/?]+|\[[^\]]+\])(?::(?<port>\d+))?/(?<db>[^?]+)(?:\?(?<query>.*))?$'
        if ($cfg['DATABASE_URL'] -match $dbPattern) {
            $uHost = $Matches['host']; $uPort = $Matches['port']; $uDb = $Matches['db']
            $uUser = $Matches['user']; $uQuery = $Matches['query']
            if ($LocalHosts -contains $uHost.ToLowerInvariant()) { Write-Pass "Database host is local ($uHost)" }
            else { Write-Problem "Database host '$uHost' is NOT local. Refusing to treat this as a safe local configuration." }

            if ($uPort -and [int]$uPort -ne $DbPort) { Write-Warn "Database port is $uPort (expected $DbPort)." }
            if ($uDb -ceq $DbName) { Write-Pass "Database name is $DbName" }
            else { Write-Problem "Database name is '$uDb' but this local setup uses '$DbName'. A different database is not treated as local-safe." }
            if ($uUser -ceq $DbRole) { Write-Pass "Database role is $DbRole" }
            else { Write-Problem "Database role is '$uUser' but this local setup uses '$DbRole'. A different role is not treated as local-safe." }
            if ($uQuery -and ($uQuery -notmatch '(^|&)schema=public(&|$)')) { Write-Warn 'DATABASE_URL has a schema parameter other than public.' }
            elseif ($uQuery -and ($uQuery -match '(^|&)schema=public(&|$)')) { Write-Pass 'schema=public is set' }
            else { Write-Info 'No schema parameter (Prisma defaults to public).' }
        }
        else {
            Write-Warn 'DATABASE_URL could not be parsed, so host and database name were not verified (special characters in the password must be percent-encoded).'
        }
    }

    # Mail must be local so no real email can be sent
    if ($cfg.ContainsKey('MAIL_HOST')) {
        if ($LocalHosts -contains $cfg['MAIL_HOST'].ToLowerInvariant()) { Write-Pass "MAIL_HOST is local ($($cfg['MAIL_HOST']))" }
        else { Write-Problem "MAIL_HOST '$($cfg['MAIL_HOST'])' is NOT local: registration could send real emails." }
    }
    if ($cfg.ContainsKey('MAIL_PORT') -and $cfg['MAIL_PORT'] -ne "$MailPort") { Write-Warn "MAIL_PORT is $($cfg['MAIL_PORT']) (Mailpit uses $MailPort)." }

    if ($cfg.ContainsKey('FRONTEND_URL')) {
        if ($cfg['FRONTEND_URL'] -eq $FrontendUrl) { Write-Pass "FRONTEND_URL is $FrontendUrl" }
        else { Write-Warn "FRONTEND_URL is '$($cfg['FRONTEND_URL'])'. It must match the browser address exactly (CORS): $FrontendUrl" }
    }

    if ($cfg.ContainsKey('JWT_ACCESS_SECRET') -and $cfg.ContainsKey('JWT_REFRESH_SECRET')) {
        if ($cfg['JWT_ACCESS_SECRET'] -eq $cfg['JWT_REFRESH_SECRET']) { Write-Problem 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical.' }
        if (($cfg['JWT_ACCESS_SECRET'].Length -lt 32) -or ($cfg['JWT_REFRESH_SECRET'].Length -lt 32)) { Write-Warn 'A JWT secret is shorter than 32 characters.' }
    }

    # Settings that normally belong to a deployed environment
    foreach ($key in @('SENTRY_DSN', 'COOKIE_DOMAIN', 'GOOGLE_CLIENT_SECRET', 'FACEBOOK_APP_SECRET', 'MICROSOFT_CLIENT_SECRET', 'SOCIAL_AUTH_STATE_SECRET')) {
        if ($cfg.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($cfg[$key])) {
            Write-Warn "$key is set. Make sure it is not a production value (local development normally leaves it unset)."
        }
    }
}
elseif (Test-CanCreate $BackendRel) {
    Write-Info 'File is missing: creating it with local settings and random JWT secrets.'
    Write-Host ''
    Write-Host "Enter the password of the local PostgreSQL role '$DbRole'. The input is hidden; it goes only into $BackendRel."
    $secure  = Read-Host "PostgreSQL password for role '$DbRole'" -AsSecureString
    $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { $dbPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }

    if ([string]::IsNullOrEmpty($dbPassword)) { Stop-Setup 'The password cannot be empty. Nothing was created.' }

    $encodedPassword = [System.Uri]::EscapeDataString($dbPassword)
    $dbPassword = $null
    $databaseUrl = 'postgresql://{0}:{1}@{2}:{3}/{4}?schema={5}' -f $DbRole, $encodedPassword, $DbHost, $DbPort, $DbName, $DbSchema
    $encodedPassword = $null

    $lines = @(
        '# Orbit CRM backend - LOCAL DEVELOPMENT ONLY. Never commit this file.',
        'NODE_ENV=development',
        'PORT=3000',
        "DATABASE_URL=$databaseUrl",
        "JWT_ACCESS_SECRET=$(New-RandomHex)",
        "JWT_REFRESH_SECRET=$(New-RandomHex)",
        'ACCESS_TOKEN_EXPIRES_IN=15m',
        'REFRESH_TOKEN_EXPIRES_IN=7d',
        "MAIL_HOST=$MailHost",
        "MAIL_PORT=$MailPort",
        'MAIL_USER=local',
        'MAIL_PASSWORD=local',
        'MAIL_FROM=Orbit CRM Local <no-reply@orbit.local>',
        "FRONTEND_URL=$FrontendUrl",
        ''
    )
    Write-NewFile -Path $backendEnv -Content ($lines -join [Environment]::NewLine)
    $databaseUrl = $null
    $lines = $null
    Write-Pass "Created $BackendRel (contents not displayed)"
}
else {
    if ($CheckOnly) { Write-Warn "$BackendRel is missing (CheckOnly: not created)." }
    else { Write-Problem "$BackendRel is missing and cannot be created safely (see the git safety results above). Nothing was created." }
}

# ---------------------------------------------------------------------
# 4. Frontend: apps\frontend\.env.local
# ---------------------------------------------------------------------
Write-Section "Frontend: $FrontendRel"

if (Test-Path -LiteralPath $frontendEnv) {
    Write-Info 'File exists: it will NOT be modified. Read-only inspection follows.'
    $fcfg = Read-EnvFile $frontendEnv

    if (-not $fcfg.ContainsKey('VITE_API_BASE_URL')) {
        Write-Problem 'VITE_API_BASE_URL is not set. The frontend would fall back to a hardcoded production address.'
    }
    elseif ([string]::IsNullOrWhiteSpace($fcfg['VITE_API_BASE_URL'])) {
        Write-Problem 'VITE_API_BASE_URL is empty. API calls would break.'
    }
    elseif ($fcfg['VITE_API_BASE_URL'] -eq $BackendUrl) {
        Write-Pass "VITE_API_BASE_URL is $BackendUrl"
    }
    else {
        $apiValue = $fcfg['VITE_API_BASE_URL']
        $isLocalApi = $false
        foreach ($h in @('localhost', '127.0.0.1')) {
            if ($apiValue -match ('^https?://' + [regex]::Escape($h) + '(:\d+)?/?$')) { $isLocalApi = $true }
        }
        if ($isLocalApi) { Write-Warn "VITE_API_BASE_URL is '$apiValue' (expected $BackendUrl)." }
        else { Write-Problem "VITE_API_BASE_URL '$apiValue' is NOT a local address." }
    }

    foreach ($key in @('VITE_SENTRY_DSN', 'VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST')) {
        if ($fcfg.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($fcfg[$key])) {
            Write-Warn "$key is set. Local development normally leaves it unset (analytics and monitoring disabled)."
        }
    }
}
elseif (Test-CanCreate $FrontendRel) {
    Write-Info 'File is missing: creating it.'
    $frontendLines = @(
        '# Orbit CRM frontend - LOCAL DEVELOPMENT ONLY. Never commit this file.',
        '# VITE_API_BASE_URL must be set and non-empty (see apps/frontend/src/services/api.ts).',
        "VITE_API_BASE_URL=$BackendUrl",
        ''
    )
    Write-NewFile -Path $frontendEnv -Content ($frontendLines -join [Environment]::NewLine)
    Write-Pass "Created $FrontendRel"
}
else {
    if ($CheckOnly) { Write-Warn "$FrontendRel is missing (CheckOnly: not created)." }
    else { Write-Problem "$FrontendRel is missing and cannot be created safely (see the git safety results above). Nothing was created." }
}

# ---------------------------------------------------------------------
# 5. Prerequisites (informational only: nothing is started or changed)
# ---------------------------------------------------------------------
Write-Section 'Prerequisites (informational)'

if (Test-TcpPort '127.0.0.1' $DbPort) { Write-Pass "Something is listening on 127.0.0.1:$DbPort (PostgreSQL)" }
else { Write-Warn "Nothing is listening on 127.0.0.1:$DbPort. Start the local PostgreSQL service." }

if (Test-TcpPort '127.0.0.1' $MailPort) { Write-Pass "Mailpit SMTP is reachable on 127.0.0.1:$MailPort" }
else { Write-Warn "Mailpit SMTP is not reachable on 127.0.0.1:$MailPort. Start Mailpit (prerequisite for registration and email verification)." }

if (Test-TcpPort '127.0.0.1' $MailUiPort) { Write-Pass "Mailpit UI is reachable on http://localhost:$MailUiPort" }
else { Write-Info "Mailpit UI is not reachable on port $MailUiPort." }

$migrationsDir = Join-Path $backendDir 'prisma\migrations'
if (Test-Path -LiteralPath $migrationsDir) {
    $migrationCount = @(Get-ChildItem -LiteralPath $migrationsDir -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'migration.sql') }).Count
    Write-Info "Prisma migrations found in the repository: $migrationCount (this script does not run them; the database is not contacted)."
}

# ---------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------
Write-Section 'Summary'
Write-Host "  Problems: $($script:Problems)   Warnings: $($script:Warnings)"
Write-Host '  No existing file was modified. The database was not contacted.'

if ($script:Problems -gt 0) {
    Write-Host '  Result: ATTENTION NEEDED (see [FAIL] lines above).' -ForegroundColor Red
    exit 1
}
Write-Host '  Result: OK' -ForegroundColor Green
exit 0