import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';

// Create a PostgreSQL connection pool
let pool: Pool;

try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  console.log("Database connection pool created successfully");
} catch (error) {
  console.error("Failed to create PostgreSQL connection pool:", error);
  // Create a valid Pool instance as a fallback
  pool = new Pool();
}

// Create a Drizzle ORM instance with the connection pool
export const db = drizzle(pool, { schema });

// Export the connection pool for direct queries if needed
export { pool };