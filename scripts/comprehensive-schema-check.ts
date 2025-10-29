import postgres from 'postgres';

const sql = postgres({
  host: process.env.PGHOST!,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE!,
  username: process.env.PGUSER!,
  password: process.env.PGPASSWORD!,
  ssl: 'require'
});

async function checkSchema() {
  console.log('🔍 COMPREHENSIVE SCHEMA ANALYSIS\n');
  console.log('='.repeat(60));
  
  // Get all tables in database
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  
  console.log(`\n📊 Found ${tables.length} tables in production database:\n`);
  
  for (const table of tables) {
    console.log(`\n🔹 Table: ${table.table_name}`);
    console.log('-'.repeat(60));
    
    // Get columns for this table
    const columns = await sql`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${table.table_name}
      ORDER BY ordinal_position
    `;
    
    for (const col of columns) {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const type = col.character_maximum_length 
        ? `${col.data_type}(${col.character_maximum_length})`
        : col.data_type;
      console.log(`  • ${col.column_name}: ${type} ${nullable}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Schema check complete\n');
  
  await sql.end();
}

checkSchema().catch(console.error);
