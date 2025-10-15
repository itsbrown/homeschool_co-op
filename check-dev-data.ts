import { Pool } from 'pg';

const devPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkDevData() {
  const client = await devPool.connect();
  try {
    // Get school info
    const schools = await client.query('SELECT * FROM schools ORDER BY id LIMIT 1');
    console.log('📚 School Data:');
    console.log(JSON.stringify(schools.rows[0], null, 2));
    
    // Get admin user
    const admins = await client.query(`SELECT * FROM users WHERE role = 'superAdmin' OR role = 'admin' ORDER BY id LIMIT 1`);
    console.log('\n👤 Admin User:');
    console.log(JSON.stringify(admins.rows[0], null, 2));
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await devPool.end();
  }
}

checkDevData().catch(console.error);
