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

async function fixPaymentFrequencyConstraint() {
  const connectionString = buildPostgresUrl();
  const sql = postgres(connectionString, { 
    prepare: false,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('🔧 Dropping old payment_frequency constraint if it exists...');
    await sql`
      ALTER TABLE program_enrollments 
      DROP CONSTRAINT IF EXISTS program_enrollments_payment_frequency_check
    `;
    
    console.log('✨ Creating new payment_frequency constraint...');
    await sql`
      ALTER TABLE program_enrollments 
      ADD CONSTRAINT program_enrollments_payment_frequency_check 
      CHECK (payment_frequency IS NULL OR payment_frequency IN ('weekly', 'biweekly', 'monthly', 'one_time'))
    `;
    
    console.log('✅ Payment frequency constraint created successfully!');
    
    // Verify the new constraint
    const constraints = await sql`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'program_enrollments'::regclass 
        AND conname = 'program_enrollments_payment_frequency_check'
    `;
    
    if (constraints.length > 0) {
      console.log('🎉 New constraint:', constraints[0].constraint_definition);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixPaymentFrequencyConstraint();
