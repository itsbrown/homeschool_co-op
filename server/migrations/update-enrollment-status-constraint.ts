import postgres from 'postgres';
import { getPostgresJsSslOption } from '../lib/database-url';

// Migration to update program_enrollments status constraint
export async function updateEnrollmentStatusConstraint() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  console.log('🔄 Running enrollment status constraint migration...');

  const sql = postgres(connectionString, { ssl: getPostgresJsSslOption(), max: 1 });

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
