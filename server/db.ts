import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import {
  getNormalizedDatabaseUrl,
  getPostgresJsSslOption,
  normalizeDatabaseUrl,
} from './lib/database-url';

// Lazy database connection variables
let dbInstance: any = null;
let client: any = null;
let connectionWorking = false;

// Cooldown tracking: retry connection at most once every 30 seconds
let lastConnectionAttempt: number = 0;
const CONNECTION_RETRY_COOLDOWN_MS = 30_000;

/**
 * In dev / test we are commonly running in the Replit container, which has
 * no IPv6 egress. Some configured `DATABASE_URL` values (notably the direct
 * Supabase host `db.<project-ref>.supabase.co`) only resolve to AAAA
 * records, so the connection fails with `ENETUNREACH ...:5432` even though
 * the URL itself is well-formed. To keep the integration test seed
 * endpoints (`/api/test/setup-auto-pay-scenario` and friends) usable in
 * dev, we fall back to `NEON_DATABASE_URL` if that is also configured.
 *
 * The fallback is gated on `NODE_ENV !== 'production'` so production
 * behaviour is never silently changed.
 */
function getCandidateConnectionStrings(): string[] {
  const candidates: string[] = [];
  const primary = getNormalizedDatabaseUrl();
  if (primary) candidates.push(primary);

  if (process.env.NODE_ENV !== 'production') {
    const fallbackRaw = process.env.NEON_DATABASE_URL;
    if (fallbackRaw) {
      const fallback = normalizeDatabaseUrl(fallbackRaw);
      if (fallback && !candidates.includes(fallback)) {
        candidates.push(fallback);
      }
    }
  }

  return candidates;
}

function tryCreateClient(connectionString: string) {
  return postgres(connectionString, {
    prepare: false,
    max: 10,
    ssl: getPostgresJsSslOption(connectionString),
  });
}

// Function to get database instance with connection testing
// Retries at most once every CONNECTION_RETRY_COOLDOWN_MS if previously failed
export async function getDb() {
  // If connection is already working, return immediately
  if (connectionWorking && dbInstance) {
    return dbInstance;
  }

  const now = Date.now();
  const timeSinceLastAttempt = now - lastConnectionAttempt;

  // If we are still within the cooldown window, don't retry
  if (lastConnectionAttempt > 0 && timeSinceLastAttempt < CONNECTION_RETRY_COOLDOWN_MS) {
    throw new Error("Database connection not available");
  }

  // Attempt (or re-attempt) connection
  lastConnectionAttempt = now;

  const candidates = getCandidateConnectionStrings();
  if (candidates.length === 0) {
    console.log("No database connection string available");
    throw new Error("Database connection not available");
  }

  let lastError: unknown = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const isFallback = i > 0;
    let candidateClient: any = null;
    try {
      candidateClient = tryCreateClient(candidate);
      // Test the connection with a simple query before adopting it.
      await candidateClient`SELECT 1`;
      client = candidateClient;
      dbInstance = drizzle(client, { schema });
      connectionWorking = true;
      if (isFallback) {
        console.log(
          "✅ Database connection test successful (using NEON_DATABASE_URL fallback because DATABASE_URL was unreachable)",
        );
      } else {
        console.log("Database connection to PostgreSQL created successfully");
        console.log("✅ Database connection test successful");
      }
      return dbInstance;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (isFallback) {
        console.log("❌ NEON_DATABASE_URL fallback also failed:", message);
      } else if (candidates.length > 1) {
        console.log(
          "⚠️  Primary DATABASE_URL connection failed, trying NEON_DATABASE_URL fallback:",
          message,
        );
      } else {
        console.log("❌ Database connection test failed:", message);
      }
      if (candidateClient) {
        try { await candidateClient.end({ timeout: 1 }); } catch { /* ignore */ }
      }
    }
  }

  connectionWorking = false;
  dbInstance = null;
  client = null;
  throw new Error("Database connection not available");
}

// Export a proxy that throws error when database is not available
export const db = new Proxy({}, {
  get() {
    throw new Error("Database connection not available - use getDb() for lazy loading");
  }
});

// Export the client for direct queries if needed
export const pool = client;
