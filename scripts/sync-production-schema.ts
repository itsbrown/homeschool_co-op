import postgres from 'postgres';

// Build properly encoded connection string
const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;

if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
  console.error('❌ Missing required PG environment variables');
  process.exit(1);
}

const encodedUser = encodeURIComponent(PGUSER);
const encodedPassword = encodeURIComponent(PGPASSWORD);
const port = PGPORT || '5432';

const connectionString = `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;

console.log('🔗 Connecting to production database...');
const sql = postgres(connectionString);

async function syncSchema() {
  try {
    console.log('🔍 Checking schools table schema...');
    
    // Get current columns in schools table
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'schools' 
      ORDER BY ordinal_position;
    `;
    
    console.log('📋 Current schools table columns:', columns.map(c => c.column_name).join(', '));
    
    const existingColumns = new Set(columns.map((c: any) => c.column_name));
    
    // Define all expected columns with their SQL definitions
    const expectedColumns: Record<string, string> = {
      'type': `ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'school'`,
      'address': `ADD COLUMN IF NOT EXISTS address TEXT`,
      'city': `ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT ''`,
      'state': `ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT ''`,
      'zip_code': `ADD COLUMN IF NOT EXISTS zip_code TEXT NOT NULL DEFAULT ''`,
      'phone_number': `ADD COLUMN IF NOT EXISTS phone_number TEXT`,
      'email': `ADD COLUMN IF NOT EXISTS email TEXT`,
      'website': `ADD COLUMN IF NOT EXISTS website TEXT`,
      'description': `ADD COLUMN IF NOT EXISTS description TEXT`,
      'founded_year': `ADD COLUMN IF NOT EXISTS founded_year INTEGER`,
      'accreditation': `ADD COLUMN IF NOT EXISTS accreditation TEXT`,
      'enrollment_size': `ADD COLUMN IF NOT EXISTS enrollment_size INTEGER`,
      'is_verified': `ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE`,
      'admin_id': `ADD COLUMN IF NOT EXISTS admin_id INTEGER`,
      'status': `ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
      'logo': `ADD COLUMN IF NOT EXISTS logo TEXT`,
      'updated_at': `ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
    };
    
    // Add missing columns
    console.log('\n🔧 Adding missing columns...');
    for (const [columnName, alterStatement] of Object.entries(expectedColumns)) {
      if (!existingColumns.has(columnName)) {
        console.log(`➕ Adding column: ${columnName}`);
        await sql.unsafe(`ALTER TABLE schools ${alterStatement};`);
        console.log(`✅ Added ${columnName}`);
      } else {
        console.log(`✓ Column ${columnName} already exists`);
      }
    }
    
    console.log('\n✅ Schema sync complete!');
    
  } catch (error) {
    console.error('❌ Error syncing schema:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

syncSchema()
  .then(() => {
    console.log('🎉 Production database schema is now up to date!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to sync schema:', error);
    process.exit(1);
  });
