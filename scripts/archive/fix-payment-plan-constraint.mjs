import postgres from 'postgres';

/**
 * Build a properly URL-encoded PostgreSQL connection string
 * from individual PG environment variables
 */
function buildPostgresUrl() {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
    return null;
  }
  
  // URL-encode the username and password to handle special characters
  const encodedUser = encodeURIComponent(PGUSER);
  const encodedPassword = encodeURIComponent(PGPASSWORD);
  const port = PGPORT || '5432';
  
  return `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
}

async function fixPaymentPlanConstraint() {
  // Build properly encoded connection string
  const connectionString = buildPostgresUrl();
  
  if (!connectionString) {
    console.error('❌ Cannot build database connection string. Missing PG environment variables.');
    process.exit(1);
  }
  
  console.log('🔗 Connecting to database...');
  const sql = postgres(connectionString, { 
    prepare: false,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('🔍 Checking current constraint definition...');
    
    // Get current constraint definition
    const constraints = await sql`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'program_enrollments'::regclass 
        AND conname = 'program_enrollments_payment_plan_check'
    `;
    
    if (constraints.length > 0) {
      console.log('📋 Current constraint:', constraints[0].constraint_definition);
    } else {
      console.log('⚠️  No existing constraint found');
    }
    
    console.log('🔧 Dropping old constraint if it exists...');
    await sql`
      ALTER TABLE program_enrollments 
      DROP CONSTRAINT IF EXISTS program_enrollments_payment_plan_check
    `;
    
    console.log('✨ Creating new constraint with biweekly support...');
    await sql`
      ALTER TABLE program_enrollments 
      ADD CONSTRAINT program_enrollments_payment_plan_check 
      CHECK (payment_plan IS NULL OR payment_plan IN ('full_payment', 'deposit_only', 'biweekly', 'custom'))
    `;
    
    console.log('✅ Payment plan constraint updated successfully!');
    
    // Verify the new constraint
    const newConstraints = await sql`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'program_enrollments'::regclass 
        AND conname = 'program_enrollments_payment_plan_check'
    `;
    
    if (newConstraints.length > 0) {
      console.log('🎉 New constraint definition:', newConstraints[0].constraint_definition);
    }
    
  } catch (error) {
    console.error('❌ Error updating constraint:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixPaymentPlanConstraint();
