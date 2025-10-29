import postgres from 'postgres';

const sql = postgres({
  host: process.env.PGHOST!,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE!,
  username: process.env.PGUSER!,
  password: process.env.PGPASSWORD!,
  ssl: 'require'
});

async function addMembershipColumns() {
  try {
    console.log('🔧 Adding membership columns to schools table...\n');
    
    // Add all membership columns
    const columns = [
      { name: 'membership_fee_amount', type: 'INTEGER DEFAULT 0' },
      { name: 'membership_renewal_month', type: 'INTEGER DEFAULT 9' },
      { name: 'membership_renewal_day', type: 'INTEGER DEFAULT 1' },
      { name: 'membership_grace_period_days', type: 'INTEGER DEFAULT 30' },
      { name: 'membership_description', type: 'TEXT' },
      { name: 'membership_required', type: 'BOOLEAN DEFAULT true' }
    ];
    
    for (const col of columns) {
      console.log(`  Adding ${col.name}...`);
      await sql.unsafe(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      console.log(`  ✅ ${col.name} added`);
    }
    
    console.log('\n✅ All membership columns added successfully');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await sql.end();
    process.exit(1);
  }
}

addMembershipColumns();
