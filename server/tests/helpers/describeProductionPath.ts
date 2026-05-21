import { beforeAll, beforeEach, describe } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { testDb } from './testDatabase';
import { resetSupabaseAuthMock } from './supabaseAuthMock';

function integrationDbAvailable(): boolean {
  if (process.env.ASA_INTEGRATION_DB_AVAILABLE === 'false') {
    return false;
  }
  const cachePath = resolve(process.cwd(), '.jest-cache/integration-db.json');
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as { available?: boolean };
      return cached.available === true;
    } catch {
      return false;
    }
  }
  return process.env.ASA_INTEGRATION_DB_AVAILABLE !== 'false';
}

function isSafeDatabaseUrlForTestTruncate(url: string): boolean {
  if (process.env.ALLOW_TEST_TRUNCATE === '1') {
    return true;
  }
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, 'postgresql://'));
    const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0] || '';
    const host = (parsed.hostname || '').toLowerCase();
    if (dbName.includes('test') || dbName.endsWith('_test')) {
      return true;
    }
    if (host.includes('test') || host.includes('localhost') || host === '127.0.0.1') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function assertProductionPathPrerequisites(): void {
  if (!integrationDbAvailable()) {
    throw new Error(
      '[production-path] Postgres is required and was not reachable in globalSetup.\n' +
        '  Fix: createdb asa_test && export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/asa_test\n' +
        '  Then: node scripts/db-push-with-env.mjs && npm run test:server -- --runInBand --testPathPatterns=production-path',
    );
  }

  const url =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://test:test@localhost:5432/asa_test';

  if (!isSafeDatabaseUrlForTestTruncate(url)) {
    throw new Error(
      '[production-path] DATABASE_URL must target a dedicated test database (e.g. asa_test).\n' +
        `  Current: ${url.replace(/:[^:@/]+@/, ':***@')}\n` +
        '  Set TEST_DATABASE_URL or ALLOW_TEST_TRUNCATE=1 only when intentional.',
    );
  }

  if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}

/**
 * Mandatory lane: never skips when Postgres is down — fails fast with fix instructions.
 */
export const describeProductionPath = (name: string, fn: () => void): void => {
  describe(name, () => {
    beforeAll(() => {
      assertProductionPathPrerequisites();
    });

    beforeEach(async () => {
      resetSupabaseAuthMock();
      await testDb.cleanup();
    });

    fn();
  });
};
