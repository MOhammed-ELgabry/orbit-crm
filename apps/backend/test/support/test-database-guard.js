'use strict';

/**
 * Shared safety guard for the Orbit CRM backend test database.
 *
 * Single source of truth, used by BOTH:
 *   - test/scripts/db-test-migrate.js  (before `prisma migrate deploy`)
 *   - test/integration/setup/test-env.ts (before Jest loads the app)
 *
 * Plain CommonJS with no dependencies and no database access on purpose:
 * it only validates connection STRINGS. The real-database check
 * (`SELECT current_database()`) is done separately by the integration
 * harness after it connects.
 *
 * Policy: the ONLY accepted target is the database named exactly
 * `orbitcrm_test`, on a local host. There is NO fallback to DATABASE_URL.
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_DATABASE_NAME = 'orbitcrm_test';
const ALLOWED_PROTOCOLS = ['postgresql:', 'postgres:'];
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'];
// libpq-style query parameters that can silently redirect the connection
// to a different server/database than the URL's visible authority/path.
const FORBIDDEN_QUERY_PARAMS = ['host', 'hostaddr', 'dbname', 'service'];

class TestDatabaseGuardError extends Error {
  constructor(message) {
    super(`[test-database-guard] ${message}`);
    this.name = 'TestDatabaseGuardError';
  }
}

/** Returns the raw authority (userinfo@host:port) of a URL string, or null. */
function extractAuthority(raw) {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/.exec(raw);
  return match ? match[1] : null;
}

/** Strips userinfo so a comma inside a password is not mistaken for a host list. */
function hostPartOf(authority) {
  const at = authority.lastIndexOf('@');
  return at === -1 ? authority : authority.slice(at + 1);
}

function normalizeHost(hostname) {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

/**
 * Parses a connection string into { protocol, host, port, database, params }.
 * Throws TestDatabaseGuardError on anything malformed or ambiguous.
 */
function parseConnectionUrl(raw, label) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new TestDatabaseGuardError(`${label} is missing or empty.`);
  }
  const value = raw.trim();

  const authority = extractAuthority(value);
  if (authority === null) {
    throw new TestDatabaseGuardError(`${label} is not a valid connection URL.`);
  }
  if (hostPartOf(authority).includes(',')) {
    throw new TestDatabaseGuardError(
      `${label} lists more than one host; exactly one local host is allowed.`,
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TestDatabaseGuardError(`${label} is not a valid connection URL.`);
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new TestDatabaseGuardError(
      `${label} must use postgresql:// or postgres:// (got "${url.protocol}").`,
    );
  }

  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new TestDatabaseGuardError(`${label} has an undecodable database name.`);
  }

  return {
    protocol: url.protocol,
    host: normalizeHost(url.hostname),
    port: url.port || '5432',
    database,
    params: [...url.searchParams.keys()].map((k) => k.toLowerCase()),
  };
}

/**
 * Throws unless `testUrl` is a safe test-database URL.
 * @param {string|undefined} testUrl      value of TEST_DATABASE_URL
 * @param {string[]} [otherUrls]          other configured URLs (DATABASE_URL, .env values...)
 *                                        that the test URL must not equal.
 * @returns {{host:string, port:string, database:string}}
 */
function assertSafeTestDatabaseUrl(testUrl, otherUrls = []) {
  if (typeof testUrl !== 'string' || testUrl.trim() === '') {
    throw new TestDatabaseGuardError(
      'TEST_DATABASE_URL is not set. Refusing to run (there is no fallback to DATABASE_URL).',
    );
  }

  const parsed = parseConnectionUrl(testUrl, 'TEST_DATABASE_URL');

  if (parsed.database === 'orbitcrm') {
    throw new TestDatabaseGuardError(
      'TEST_DATABASE_URL points to "orbitcrm" (the development database). Refusing.',
    );
  }

  if (parsed.database !== ALLOWED_DATABASE_NAME) {
    throw new TestDatabaseGuardError(
      `Database name must be exactly "${ALLOWED_DATABASE_NAME}" (got "${parsed.database}").`,
    );
  }

  if (!ALLOWED_HOSTS.includes(parsed.host)) {
    throw new TestDatabaseGuardError(
      `Host must be one of ${ALLOWED_HOSTS.join(', ')} (got "${parsed.host}").`,
    );
  }

  const forbidden = parsed.params.filter((p) => FORBIDDEN_QUERY_PARAMS.includes(p));
  if (forbidden.length > 0) {
    throw new TestDatabaseGuardError(
      `Query parameter(s) not allowed because they can redirect the connection: ${forbidden.join(', ')}.`,
    );
  }

  const testIdentity = `${parsed.host}:${parsed.port}/${parsed.database}`;
  for (const other of otherUrls) {
    if (typeof other !== 'string' || other.trim() === '') continue;
    if (other.trim() === testUrl.trim()) {
      throw new TestDatabaseGuardError(
        'TEST_DATABASE_URL is identical to DATABASE_URL. Refusing.',
      );
    }
    try {
      const o = parseConnectionUrl(other, 'DATABASE_URL');
      if (`${o.host}:${o.port}/${o.database}` === testIdentity) {
        throw new TestDatabaseGuardError(
          'TEST_DATABASE_URL targets the same host/port/database as DATABASE_URL. Refusing.',
        );
      }
    } catch (error) {
      if (error instanceof TestDatabaseGuardError && /same host|identical/.test(error.message)) {
        throw error;
      }
      // An unparsable DATABASE_URL is not this guard's concern; the
      // exact-name allowlist above already protects the target.
    }
  }

  return { host: parsed.host, port: parsed.port, database: parsed.database };
}

/** Minimal KEY=VALUE parser (no dependency). Handles comments and quotes. */
function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function readEnvFileIfPresent(filePath) {
  try {
    return parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Loads `<backendRoot>/.env.test` into process.env WITHOUT overriding values
 * already present. Never reads .env / .env.local into process.env.
 */
function loadTestEnv(backendRoot) {
  const values = readEnvFileIfPresent(path.join(backendRoot, '.env.test'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return values;
}

/**
 * Full guard used by callers: loads .env.test, collects DATABASE_URL values
 * (process env + .env + .env.local, READ-ONLY, only for comparison), validates
 * TEST_DATABASE_URL and returns it. Throws TestDatabaseGuardError otherwise.
 */
function resolveSafeTestDatabaseUrl(backendRoot) {
  loadTestEnv(backendRoot);

  const otherUrls = [
    process.env.DATABASE_URL,
    readEnvFileIfPresent(path.join(backendRoot, '.env')).DATABASE_URL,
    readEnvFileIfPresent(path.join(backendRoot, '.env.local')).DATABASE_URL,
  ];

  assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, otherUrls);
  return process.env.TEST_DATABASE_URL.trim();
}

module.exports = {
  ALLOWED_DATABASE_NAME,
  ALLOWED_HOSTS,
  TestDatabaseGuardError,
  assertSafeTestDatabaseUrl,
  parseEnvFile,
  loadTestEnv,
  resolveSafeTestDatabaseUrl,
};