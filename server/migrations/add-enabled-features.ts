import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from '../lib/database-url';

async function addColumn() {
  const connectionString = getNormalizedDatabaseUrl();

  if (!connectionString) {
    console.error('No database connection string available');
    process.exit(1);
  }

  const sql = postgres(connectionString, { ssl: getPostgresJsSslOption(connectionString) });
  
  try {
    await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS enabled_features JSONB DEFAULT '{}' NOT NULL`;
    console.log('✅ enabled_features column added successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
  
  await sql.end();
}

addColumn();
