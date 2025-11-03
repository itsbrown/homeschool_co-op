import postgres from 'postgres';

function buildPostgresUrl() {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
    return null;
  }
  
  const encodedUser = encodeURIComponent(PGUSER);
  const encodedPassword = encodeURIComponent(PGPASSWORD);
  const port = PGPORT || '5432';
  
  return `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
}

async function checkConstraints() {
  const connectionString = buildPostgresUrl();
  const sql = postgres(connectionString, { 
    prepare: false,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('📋 All constraints on program_enrollments:');
    const constraints = await sql`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'program_enrollments'::regclass
      ORDER BY conname
    `;
    
    constraints.forEach(c => {
      console.log(`\n${c.constraint_name}:`);
      console.log(`  ${c.constraint_definition}`);
    });
    
    console.log('\n\n📋 Column order in program_enrollments:');
    const columns = await sql`
      SELECT 
        column_name,
        ordinal_position,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'program_enrollments'
      ORDER BY ordinal_position
    `;
    
    columns.forEach(c => {
      console.log(`${c.ordinal_position}. ${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.end();
  }
}

checkConstraints();
