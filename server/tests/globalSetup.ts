/**
 * Runs once before the integration suite (separate process).
 * Writes `.jest-cache/integration-db.json` for jest-setup-env.cjs to read.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://test:test@localhost:5432/asa_test';

  const cacheDir = resolve(process.cwd(), '.jest-cache');
  const cachePath = resolve(cacheDir, 'integration-db.json');
  const masked = url.replace(/:[^:@/]+@/, ':***@');

  let available = false;
  let errorMessage = '';

  try {
    const postgres = (await import('postgres')).default;
    const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 5 });
    await sql`SELECT 1`;
    await sql.end({ timeout: 2 });
    available = true;
    // eslint-disable-next-line no-console
    console.log('[jest globalSetup] Postgres reachable:', masked);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    errorMessage = e?.message || e?.code || String(err);
    // eslint-disable-next-line no-console
    console.warn(
      '[jest globalSetup] Postgres NOT reachable — DB integration suites will be skipped.\n' +
        `  URL: ${masked}\n` +
        `  Error: ${errorMessage || '(no message — is Postgres running on localhost:5432?)'}\n` +
        '  Fix: createdb asa_test && export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/asa_test',
    );
  }

  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    cachePath,
    JSON.stringify({ available, url: masked, error: errorMessage || undefined }),
    'utf8',
  );
}
