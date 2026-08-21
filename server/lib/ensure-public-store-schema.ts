import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from './database-url';

let ensured = false;

const PUBLIC_STORE_MIGRATIONS = [
  'server/migrations/251-public-store.sql',
  'server/migrations/255-store-affiliate-products.sql',
  'server/migrations/261-store-product-pickup-only.sql',
] as const;

/** Idempotent apply of public store migrations (E2E + local). */
export async function ensurePublicStoreSchema(): Promise<void> {
  if (ensured) return;

  const connectionString = getNormalizedDatabaseUrl();
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: getPostgresJsSslOption(connectionString),
  });

  try {
    for (const relativePath of PUBLIC_STORE_MIGRATIONS) {
      const migrationPath = path.join(process.cwd(), relativePath);
      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Missing migration file: ${migrationPath}`);
      }
      await client.file(migrationPath);
    }
    ensured = true;
  } finally {
    await client.end({ timeout: 5 });
  }
}
