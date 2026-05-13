import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from '../server/lib/database-url';

const connectionString = getNormalizedDatabaseUrl();
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: getPostgresJsSslOption(connectionString) });

async function addColumn() {
  try {
    console.log('🔧 Adding registration_code column to schools table...');
    await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS registration_code TEXT UNIQUE`;
    console.log('✅ Column added successfully');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await sql.end();
    process.exit(1);
  }
}

addColumn();
