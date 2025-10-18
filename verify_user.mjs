import postgres from 'postgres';

const client = postgres({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: 'require'
});

try {
  console.log('🔍 Verifying user and school data...\n');
  
  // Check user
  const [user] = await client`
    SELECT id, email, role, school_id FROM users 
    WHERE email = 'coreycreates@gmail.com'
  `;
  
  console.log('User data:');
  console.log(`  ID: ${user.id}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Role: ${user.role}`);
  console.log(`  School ID: ${user.school_id}`);
  
  // Check school
  const [school] = await client`
    SELECT id, name, admin_id FROM schools WHERE id = 1
  `;
  
  console.log('\nSchool data:');
  console.log(`  ID: ${school.id}`);
  console.log(`  Name: ${school.name}`);
  console.log(`  Admin ID: ${school.admin_id}`);
  
  console.log('\n🔍 Checking relationship:');
  console.log(`  User's school_id (${user.school_id}) matches school.id (${school.id}): ${user.school_id === school.id ? '✅' : '❌'}`);
  console.log(`  User's id (${user.id}) matches school.admin_id (${school.admin_id}): ${user.id === school.admin_id ? '✅' : '❌'}`);
  
  await client.end();
} catch (error) {
  console.error('❌ Error:', error.message);
  await client.end();
  process.exit(1);
}
