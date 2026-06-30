import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from './database-url';

let ensured = false;

/** Idempotent apply of `server/migrations/251-public-store.sql` (E2E + local). */
export async function ensurePublicStoreSchema(): Promise<void> {
  if (ensured) return;

  const connectionString = getNormalizedDatabaseUrl();
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }

  const migrationPath = path.join(process.cwd(), 'server/migrations/251-public-store.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Missing migration file: ${migrationPath}`);
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: getPostgresJsSslOption(connectionString),
  });

  try {
    await client.file(migrationPath);
    ensured = true;
  } finally {
    await client.end({ timeout: 5 });
  }
}
