import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function check() {
  const client = await pool.connect();
  try {
    // Check for users table
    const usersCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    console.log('Users table exists:', usersCheck.rows[0].exists);
    
    // Check for role enum
    const enumCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_type 
        WHERE typname = 'role'
      );
    `);
    console.log('Role enum exists:', enumCheck.rows[0].exists);
    
    // List all enum types
    const enums = await client.query(`
      SELECT typname FROM pg_type 
      WHERE typtype = 'e'
      ORDER BY typname;
    `);
    console.log('\nExisting enums:', enums.rows.map(r => r.typname).join(', ') || 'none');
    
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
