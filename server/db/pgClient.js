import pkg from 'pg';
import { getDbSslConfig } from '../lib/database-url.mjs';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getDbSslConfig(),
});

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.stack);
});

export default pool;
