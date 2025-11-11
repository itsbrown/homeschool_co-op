import postgres from 'postgres';

// Migration to update program_enrollments status constraint
export async function updateEnrollmentStatusConstraint() {
  // Get database URL from environment with URL encoding for special characters
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';
  const host = process.env.PGHOST || 'localhost';
  const database = process.env.PGDATABASE || 'postgres';
  const port = parseInt(process.env.PGPORT || '5432');
  
  // URL encode the password to handle special characters
  const encodedPassword = encodeURIComponent(password);
  const connectionString = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
  
  console.log('🔄 Running enrollment status constraint migration...');
  console.log('Using constructed DATABASE_URL from PG variables with URL encoding');
  
  const sql = postgres(connectionString, { ssl: 'require', max: 1 });

  try {
    // Drop the old constraint if it exists
    await sql`
      ALTER TABLE program_enrollments 
      DROP CONSTRAINT IF EXISTS program_enrollments_status_check
    `;
    console.log('✅ Dropped old status constraint');

    // Add the new constraint with expanded status values
    await sql`
      ALTER TABLE program_enrollments 
      ADD CONSTRAINT program_enrollments_status_check 
      CHECK (status IN ('pending_payment', 'enrolled', 'waitlist', 'cancelled', 'completed', 'withdrawn', 'failed'))
    `;
    console.log('✅ Added new status constraint with expanded values: pending_payment, enrolled, waitlist, cancelled, completed, withdrawn, failed');

    await sql.end();
    console.log('✅ Migration completed: enrollment status constraint updated');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await sql.end();
    throw error;
  }
}
