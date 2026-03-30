import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { buildPostgresUrl } from './lib/database-url';

// Lazy database connection variables
let dbInstance: any = null;
let client: any = null;
let connectionWorking = false;

// Retry-after tracking: don't hammer the DB on every request after a failure.
// Allow a retry attempt every 30 seconds after the last failure.
let lastFailureTime: number = 0;
const RETRY_INTERVAL_MS = 30_000;

// Serialise concurrent initialisation attempts so we don't spin up duplicate clients.
let initPromise: Promise<any> | null = null;

// Function to initialize database connection
function buildConnectionString(): string | undefined {
  let connectionString = process.env.DATABASE_URL;
  
  // Use individual PG variables when DATABASE_URL is absent or points to old Supabase
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && 
      (!connectionString || connectionString.includes('supabase.co'))) {
    connectionString = buildPostgresUrl() || undefined;
    console.log("Using constructed DATABASE_URL from PG variables with URL encoding");
  }
  return connectionString;
}

async function initializeDatabase(): Promise<any> {
  const connectionString = buildConnectionString();
  if (!connectionString) {
    console.log("No database connection string available");
    return null;
  }

  // Tear down any stale client before recreating
  if (client) {
    try { await client.end(); } catch { /* ignore */ }
    client = null;
    dbInstance = null;
  }

  try {
    client = postgres(connectionString, { 
      prepare: false,
      max: 10,
      ssl: { rejectUnauthorized: false }
    });
    
    console.log("Database connection to PostgreSQL created successfully");
    const db = drizzle(client, { schema });

    // Test the connection with a simple query
    await client`SELECT 1`;
    connectionWorking = true;
    console.log("✅ Database connection test successful");
    dbInstance = db;
    return db;
  } catch (error) {
    console.log("❌ Database connection test failed:", error instanceof Error ? error.message : 'Unknown error');
    connectionWorking = false;
    dbInstance = null;
    if (client) {
      try { await client.end(); } catch { /* ignore */ }
      client = null;
    }
    lastFailureTime = Date.now();
    return null;
  }
}

// Called by storage layer when a DB query fails with a connection error —
// flags the connection as broken so the next getDb() call will reconnect.
export function markConnectionFailed() {
  if (connectionWorking) {
    console.log('🔌 DB connection marked as failed — will reconnect on next request after cool-down');
    connectionWorking = false;
    lastFailureTime = Date.now();
    dbInstance = null;
    if (client) {
      try { client.end(); } catch { /* ignore */ }
      client = null;
    }
  }
}

// Function to get database instance with automatic reconnection on transient failures
export async function getDb() {
  // If we have a working connection, return it immediately
  if (connectionWorking && dbInstance) {
    return dbInstance;
  }

  // If a failure occurred recently, don't retry yet to avoid hammering the DB
  if (!connectionWorking && lastFailureTime > 0) {
    const timeSinceFailure = Date.now() - lastFailureTime;
    if (timeSinceFailure < RETRY_INTERVAL_MS) {
      throw new Error("Database connection not available");
    }
    console.log(`🔄 Retrying database connection after ${Math.round(timeSinceFailure / 1000)}s...`);
  }

  // Serialise concurrent init attempts
  if (!initPromise) {
    initPromise = initializeDatabase().finally(() => { initPromise = null; });
  }

  const db = await initPromise;
  if (db) {
    return db;
  }
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