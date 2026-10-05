'use strict';

/**
 * Applies the existing Prisma migrations to the TEST database only.
 *
 *   npm run db:test:migrate
 *
 * Flow:
 *   1. Refuse any command-line arguments (so `-- reset`, `-- --force`, etc.
 *      can never be smuggled in; the Prisma command below is fixed).
 *   2. Run the shared safety guard (test/support/test-database-guard.js):
 *      TEST_DATABASE_URL must exist, be a local host, and name EXACTLY
 *      `orbitcrm_test`; it must differ from DATABASE_URL. No fallback.
 *   3. Only then, run `prisma migrate deploy` with DATABASE_URL set to the
 *      validated TEST_DATABASE_URL for that child process only.
 *
 * This script never runs `migrate reset`, `migrate dev` or `db push`, never
 * connects to the database itself, and never modifies .env files.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  TestDatabaseGuardError,
  assertSafeTestDatabaseUrl,
  resolveSafeTestDatabaseUrl,
} = require('../support/test-database-guard');

// apps/backend (this file lives in apps/backend/test/scripts).
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'prisma', 'migrations');

// The ONLY Prisma command this script can run. Frozen on purpose.
const PRISMA_ARGS = Object.freeze(['migrate', 'deploy']);

function fail(message) {
  console.error(`\n[db:test:migrate] REFUSED: ${message}\n`);
  process.exit(1);
}

function describeTarget(url) {
  // Never print credentials: re-derive host/port/db through the guard.
  const { host, port, database } = assertSafeTestDatabaseUrl(url);
  return `${host}:${port}/${database}`;
}

function resolvePrismaCli() {
  let pkgPath;
  try {
    pkgPath = require.resolve('prisma/package.json', { paths: [BACKEND_ROOT] });
  } catch {
    fail(
      'Could not find the local "prisma" package. Run `npm ci` in apps/backend first.',
    );
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.prisma;
  if (!bin) {
    fail('The installed "prisma" package does not declare a CLI entry point.');
  }

  const cliPath = path.join(path.dirname(pkgPath), bin);
  if (!fs.existsSync(cliPath)) {
    fail(`Prisma CLI entry point not found at ${cliPath}.`);
  }
  return cliPath;
}

function main() {
  // 1. No arguments are accepted.
  if (process.argv.length > 2) {
    fail(
      'This script takes no arguments. The Prisma command is fixed to `migrate deploy`.',
    );
  }

  // 2. Safety guard BEFORE anything touches Prisma.
  let testDatabaseUrl;
  try {
    testDatabaseUrl = resolveSafeTestDatabaseUrl(BACKEND_ROOT);
  } catch (error) {
    if (error instanceof TestDatabaseGuardError) {
      fail(error.message);
    }
    throw error;
  }

  if (!fs.existsSync(SCHEMA_PATH)) fail(`Prisma schema not found at ${SCHEMA_PATH}.`);
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fail(`Prisma migrations folder not found at ${MIGRATIONS_DIR}.`);
  }

  const prismaCli = resolvePrismaCli();

  console.log(`[db:test:migrate] Target: ${describeTarget(testDatabaseUrl)}`);
  console.log(`[db:test:migrate] Running: prisma ${PRISMA_ARGS.join(' ')}`);

  // 3. Fixed command, explicit env for the child only.
  const result = spawnSync(
    process.execPath,
    [prismaCli, ...PRISMA_ARGS, '--schema', SCHEMA_PATH],
    {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl,
      },
      stdio: 'inherit',
      shell: false,
    },
  );

  if (result.error) {
    fail(`Failed to start Prisma: ${result.error.message}`);
  }
  process.exit(result.status === null ? 1 : result.status);
}

main();