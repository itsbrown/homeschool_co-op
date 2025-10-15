import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function testConnection() {
  const client = await pool.connect();
  try {
    // Test basic connection
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection working');
    console.log('   Current time:', result.rows[0].now);
    
    // Check if schools exist
    const schools = await client.query('SELECT COUNT(*) FROM schools');
    console.log('   Schools in DB:', schools.rows[0].count);
    
    // Check if users exist
    const users = await client.query('SELECT COUNT(*) FROM users');
    console.log('   Users in DB:', users.rows[0].count);
    
    // Check staff data (file-based, not in DB)
    console.log('\n📋 Staff are stored in file system (data/staff.json), not in database');
    
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testConnection().catch(console.error);
