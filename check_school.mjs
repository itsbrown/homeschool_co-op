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
  console.log('🔍 Checking school data...\n');
  
  // Check user
  const [user] = await client`
    SELECT id, email, role, school_id FROM users 
    WHERE email = 'coreycreates@gmail.com'
  `;
  
  if (user) {
    console.log('✅ User found:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   School ID: ${user.school_id}`);
  } else {
    console.log('❌ User not found');
  }
  
  console.log('\n📚 Checking schools table...');
  const schools = await client`
    SELECT id, name, slug FROM schools ORDER BY id
  `;
  
  if (schools.length === 0) {
    console.log('❌ No schools found in database!');
  } else {
    console.log(`✅ Found ${schools.length} school(s):`);
    schools.forEach(s => {
      console.log(`   ID: ${s.id}, Name: ${s.name}, Slug: ${s.slug}`);
    });
  }
  
  await client.end();
} catch (error) {
  console.error('❌ Error:', error.message);
  await client.end();
  process.exit(1);
}
