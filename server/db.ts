import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create a PostgreSQL connection for Supabase
const connectionString = process.env.DATABASE_URL;

// Parse and fix URL encoding issues
let client;
try {
  client = postgres(connectionString, { 
    prepare: false,
    max: 10,
    ssl: { rejectUnauthorized: false }
  });
} catch (error) {
  // If URL parsing fails, try with manual configuration
  client = postgres({
    host: 'db.moivwjuglwwfrhqeewju.supabase.co',
    port: 5432,
    database: 'postgres',
    username: 'postgres',
    password: 'SZ+)R5R4?wjEWB8',
    ssl: { rejectUnauthorized: false },
    prepare: false,
    max: 10
  });
}

console.log("Database connection to Supabase created successfully");

// Create a Drizzle ORM instance with the connection
export const db = drizzle(client, { schema });

// Export the client for direct queries if needed
export { client as pool };