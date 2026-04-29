import pkg from 'pg';
import { getDbSslConfig, getNormalizedDatabaseUrl } from '../lib/database-url.mjs';

const { Pool } = pkg;

const _connectionString = getNormalizedDatabaseUrl();

const pool = new Pool({
  connectionString: _connectionString,
  ssl: getDbSslConfig(_connectionString),
});

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.stack);
});

export default pool;
