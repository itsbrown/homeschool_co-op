import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from './database-url';

let client: postgres.Sql | undefined;

/**
 * Direct postgres.js client for registration/bootstrap queries.
 * Avoids drizzle `db.execute()` return-shape differences on Replit.
 */
export function getRawPg(): postgres.Sql {
  const url = getNormalizedDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!client) {
    client = postgres(url, {
      prepare: false,
      max: 3,
      connect_timeout: 15,
      ssl: getPostgresJsSslOption(url),
    });
  }
  return client;
}
