import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { buildPostgresUrl } from './lib/database-url';

// Lazy database connection variables
let dbInstance: any = null;
let client: any = null;
let connectionWorking = false;

// Cooldown tracking: retry connection at most once every 30 seconds
let lastConnectionAttempt: number = 0;
const CONNECTION_RETRY_COOLDOWN_MS = 30_000;

// Function to initialize database connection
function initializeDatabase() {
  // Construct connection string from individual PG variables if DATABASE_URL is invalid
  let connectionString = process.env.DATABASE_URL;
  
  // Check if we have individual PG variables and DATABASE_URL looks like old Supabase
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && 
      (!connectionString || connectionString.includes('supabase.co'))) {
    connectionString = buildPostgresUrl() || undefined;
    console.log("Using constructed DATABASE_URL from PG variables with URL encoding");
  }
  
  if (!connectionString) {
    console.log("No database connection string available");
    return null;
  }

  try {
    client = postgres(connectionString, { 
      prepare: false,
      max: 10,
      ssl: { rejectUnauthorized: false }
    });
    
    console.log("Database connection to PostgreSQL created successfully");
    dbInstance = drizzle(client, { schema });
    return dbInstance;
  } catch (error) {
    console.log("Failed to create database connection:", error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
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
  
  try {
    const db = initializeDatabase();
    if (db) {
      // Test the connection with a simple query
      await client`SELECT 1`;
      connectionWorking = true;
      console.log("✅ Database connection test successful");
      return db;
    }
  } catch (error) {
    console.log("❌ Database connection test failed:", error instanceof Error ? error.message : 'Unknown error');
    connectionWorking = false;
    dbInstance = null;
    client = null;
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
