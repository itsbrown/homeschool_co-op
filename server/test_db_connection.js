import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from './lib/database-url.mjs';

async function testConnection() {
  console.log('🔍 Testing database connection...');
  const connectionString = getNormalizedDatabaseUrl();
  console.log('DATABASE_URL exists:', !!connectionString);

  if (connectionString) {
    const protocol = connectionString.split('://')[0];
    const hostStart = connectionString.indexOf('@') + 1;
    const hostEnd = connectionString.indexOf('/', hostStart);
    const host = hostEnd > hostStart ? connectionString.substring(hostStart, hostEnd) : connectionString.substring(hostStart);
    console.log('DATABASE_URL protocol:', protocol);
    console.log('DATABASE_URL host:', host);
  } else {
    console.log('❌ DATABASE_URL is not set');
    return;
  }

  try {
    const client = postgres(connectionString, {
      prepare: false,
      max: 1,
      ssl: getPostgresJsSslOption(connectionString),
    });

    console.log('🔧 Attempting database connection...');
    const result = await client`SELECT 1 as test`;
    console.log('✅ Database connection successful!');
    console.log('Test query result:', result);

    await client.end();
  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
    if (error.code) {
      console.log('Error code:', error.code);
    }
  }
}

testConnection().catch(console.error);
