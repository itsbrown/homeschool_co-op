import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

// Lazy database connection variables
let dbInstance: any = null;
let client: any = null;
let connectionTested = false;
let connectionWorking = false;

// Function to initialize database connection
function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set, database will not be available");
    return null;
  }

  const connectionString = process.env.DATABASE_URL;

  try {
    client = postgres(connectionString, { 
      prepare: false,
      max: 10,
      ssl: { rejectUnauthorized: false }
    });
    
    console.log("Database connection to Supabase created successfully");
    dbInstance = drizzle(client, { schema });
    return dbInstance;
  } catch (error) {
    console.log("Failed to create database connection:", error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Function to get database instance with connection testing
export async function getDb() {
  if (!connectionTested) {
    connectionTested = true;
    
    try {
      const db = initializeDatabase();
      if (db) {
        // Test the connection with a simple query
        await db.execute('SELECT 1');
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
  }

  if (connectionWorking && dbInstance) {
    return dbInstance;
  } else {
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