import postgres from 'postgres';

const sql = postgres({
  host: process.env.PGHOST!,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE!,
  username: process.env.PGUSER!,
  password: process.env.PGPASSWORD!,
  ssl: 'require'
});

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
