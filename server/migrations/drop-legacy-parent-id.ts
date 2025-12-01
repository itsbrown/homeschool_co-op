import postgres from 'postgres';
import { buildPostgresUrl } from '../lib/database-url';

async function runMigration() {
  let connectionString = process.env.DATABASE_URL;
  
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && 
      (!connectionString || connectionString.includes('supabase.co'))) {
    connectionString = buildPostgresUrl() || undefined;
    console.log("Using constructed DATABASE_URL from PG variables");
  }
  
  if (!connectionString) {
    console.error("No database connection string available");
    process.exit(1);
  }

  const client = postgres(connectionString, { 
    prepare: false,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Checking if parent_id column exists in membership_enrollments...");
    
    const columns = await client`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'membership_enrollments' AND column_name = 'parent_id'
    `;
    
    if (columns.length > 0) {
      console.log("Found legacy parent_id column, dropping it...");
      await client`ALTER TABLE membership_enrollments DROP COLUMN parent_id`;
      console.log("✅ Successfully dropped parent_id column from membership_enrollments");
    } else {
      console.log("✅ parent_id column not found - no migration needed");
    }
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    await client.end();
    process.exit(1);
  }
}

runMigration();
