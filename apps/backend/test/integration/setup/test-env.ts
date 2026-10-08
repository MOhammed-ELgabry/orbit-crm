/**
 * Jest `setupFiles` entry for the integration tests (see test/jest-int.json).
 *
 * This is the FIRST safety gate: it runs before any test file and therefore
 * before Nest / AppModule / Prisma are ever imported.
 *
 *   Jest -> test-env.ts -> test-database-guard.js
 *        -> NODE_ENV=test, DATABASE_URL=<validated TEST_DATABASE_URL>
 *
 * Responsibilities (and nothing else):
 *   1. Ask the shared guard to resolve + validate the test database URL.
 *   2. Point NODE_ENV and DATABASE_URL at it for this test process.
 *
 * It never connects to a database, never creates a PrismaClient and has no
 * try/catch: if the guard throws, the setup file throws, the suite fails to
 * run and the application is never loaded (fail closed, no fallback).
 */
import * as path from 'path';

import * as testDatabaseGuard from '../../support/test-database-guard';

// The guard is plain CommonJS JavaScript; describe only what is used here.
interface TestDatabaseGuard {
  resolveSafeTestDatabaseUrl(backendRoot: string): string;
}

const { resolveSafeTestDatabaseUrl } =
  testDatabaseGuard as unknown as TestDatabaseGuard;

// apps/backend (this file lives in apps/backend/test/integration/setup).
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');

// Throws (and stops everything) unless TEST_DATABASE_URL is the safe test DB.
const validatedTestDatabaseUrl = resolveSafeTestDatabaseUrl(BACKEND_ROOT);

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = validatedTestDatabaseUrl;
