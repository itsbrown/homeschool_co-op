import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function checkSchema() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);
    
    console.log('📋 Existing tables in production database:');
    result.rows.forEach((row: any) => console.log(`  - ${row.tablename}`));
    console.log(`\nTotal: ${result.rows.length} tables`);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchema().catch(console.error);
