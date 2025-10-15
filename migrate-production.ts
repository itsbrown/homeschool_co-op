import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres";

const pool = new Pool({ connectionString });

async function migrate() {
  const migrationSQL = fs.readFileSync(path.join(process.cwd(), 'migrations/0000_gray_excalibur.sql'), 'utf8');
  
  const client = await pool.connect();
  try {
    console.log('🚀 Starting production migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration completed successfully!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
