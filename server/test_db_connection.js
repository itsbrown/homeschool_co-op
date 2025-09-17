const postgres = require('postgres');

async function testConnection() {
  console.log('🔍 Testing database connection...');
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  
  // Show a safe portion of DATABASE_URL
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    const protocol = url.split('://')[0];
    const hostStart = url.indexOf('@') + 1;
    const hostEnd = url.indexOf('/', hostStart);
    const host = hostEnd > hostStart ? url.substring(hostStart, hostEnd) : url.substring(hostStart);
    console.log('DATABASE_URL protocol:', protocol);
    console.log('DATABASE_URL host:', host);
  } else {
    console.log('❌ DATABASE_URL is not set');
    return;
  }

  try {
    const client = postgres(process.env.DATABASE_URL, { 
      prepare: false,
      max: 1,
      ssl: { rejectUnauthorized: false }
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
