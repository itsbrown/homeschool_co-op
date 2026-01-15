import postgres from 'postgres';
import { buildPostgresUrl } from '../lib/database-url';

async function addColumn() {
  let connectionString = process.env.DATABASE_URL;
  
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && 
      (!connectionString || connectionString.includes('supabase.co'))) {
    connectionString = buildPostgresUrl() || undefined;
  }
  
  if (!connectionString) {
    console.error('No database connection string available');
    process.exit(1);
  }
  
  const sql = postgres(connectionString, { ssl: { rejectUnauthorized: false } });
  
  try {
    await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS enabled_features JSONB DEFAULT '{}' NOT NULL`;
    console.log('✅ enabled_features column added successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
  
  await sql.end();
}

addColumn();
