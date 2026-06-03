import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import {
  getNormalizedDatabaseUrl,
  getPostgresJsSslOption,
} from './lib/database-url';

// Lazy database connection variables
let dbInstance: any = null;
let client: any = null;
let connectionWorking = false;
/** After a successful connect, failed reconnects use cooldown; startup failures retry immediately. */
let hadSuccessfulConnection = false;

// Cooldown tracking: retry connection at most once every 30 seconds
let lastConnectionAttempt: number = 0;
const CONNECTION_RETRY_COOLDOWN_MS = 30_000;

/**
 * Returns the single normalized `DATABASE_URL` to connect with, or `null`
 * if it is not configured.
 *
 * Both dev and prod now use a single Replit-managed Postgres
 * (`DATABASE_URL` is populated by Replit). The legacy Neon dev DB has
 * been retired and there is no fallback path.
 */
function getCandidateConnectionStrings(): string[] {
  const primary = getNormalizedDatabaseUrl();
  return primary ? [primary] : [];
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

  // Cooldown only after we've previously connected — avoid locking out login on cold start.
  if (
    hadSuccessfulConnection &&
    lastConnectionAttempt > 0 &&
    timeSinceLastAttempt < CONNECTION_RETRY_COOLDOWN_MS
  ) {
    if (process.env.NODE_ENV === 'test' && dbInstance) {
      return dbInstance;
    }
    throw new Error("Database connection not available");
  }

  // Attempt (or re-attempt) connection
  lastConnectionAttempt = now;

  const candidates = getCandidateConnectionStrings();
  if (candidates.length === 0) {
    console.log("No database connection string available");
    throw new Error("Database connection not available");
  }

  const candidate = candidates[0];
  let candidateClient: any = null;
  try {
    candidateClient = tryCreateClient(candidate);
    // Test the connection with a simple query before adopting it.
    await candidateClient`SELECT 1`;
    client = candidateClient;
    dbInstance = drizzle(client, { schema });
    connectionWorking = true;
    hadSuccessfulConnection = true;
    console.log("Database connection to PostgreSQL created successfully");
    console.log("✅ Database connection test successful");
    return dbInstance;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log("❌ Database connection test failed:", message);
    if (candidateClient) {
      try { await candidateClient.end({ timeout: 1 }); } catch { /* ignore */ }
    }
    connectionWorking = false;
    dbInstance = null;
    client = null;
    throw new Error("Database connection not available");
  }
}

// Export a proxy that throws error when database is not available
export const db = new Proxy({}, {
  get() {
    throw new Error("Database connection not available - use getDb() for lazy loading");
  }
});

// Export the client for direct queries if needed
export const pool = client;

/** Integration tests: drop cached pool between cases so TRUNCATE + writes share one connection. */
export async function resetDbConnectionStateForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  connectionWorking = false;
  lastConnectionAttempt = 0;
  if (client) {
    try {
      await client.end({ timeout: 2 });
    } catch {
      /* ignore */
    }
  }
  client = null;
  dbInstance = null;
}
