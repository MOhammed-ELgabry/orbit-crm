/**
 * Type declarations for test-database-guard.js (plain CommonJS JavaScript).
 * Mirrors the real `module.exports` of that file and nothing else.
 */

export const ALLOWED_DATABASE_NAME: string;
export const ALLOWED_HOSTS: string[];

export class TestDatabaseGuardError extends Error {
  constructor(message: string);
}

export function assertSafeTestDatabaseUrl(
  testUrl: string | undefined,
  otherUrls?: string[],
): { host: string; port: string; database: string };

export function parseEnvFile(content: string): Record<string, string>;

export function loadTestEnv(backendRoot: string): Record<string, string>;

export function resolveSafeTestDatabaseUrl(backendRoot: string): string;