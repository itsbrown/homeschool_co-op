import postgres from 'postgres';

function buildPostgresUrl() {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
    throw new Error('Missing PG credentials');
  }
  
  const encodedUser = encodeURIComponent(PGUSER);
  const encodedPassword = encodeURIComponent(PGPASSWORD);
  const port = PGPORT || '5432';
  
  return `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
}

const url = buildPostgresUrl();
console.log('Connecting to database...');

const sql = postgres(url);

try {
  // Drop old constraint
  console.log('Dropping old constraint...');
  await sql`ALTER TABLE program_enrollments DROP CONSTRAINT IF EXISTS program_enrollments_payment_plan_check`;
  
  // Add new constraint with biweekly
  console.log('Adding new constraint with biweekly...');
  await sql`ALTER TABLE program_enrollments ADD CONSTRAINT program_enrollments_payment_plan_check CHECK (payment_plan IN ('full_payment', 'deposit_only', 'biweekly', 'custom'))`;
  
  // Update stripe_subscription_schedules too
  console.log('Updating stripe_subscription_schedules constraint...');
  await sql`ALTER TABLE stripe_subscription_schedules DROP CONSTRAINT IF EXISTS stripe_subscription_schedules_payment_plan_check`;
  await sql`ALTER TABLE stripe_subscription_schedules ADD CONSTRAINT stripe_subscription_schedules_payment_plan_check CHECK (payment_plan IN ('deposit', 'split', 'biweekly', 'full'))`;
  
  console.log('✅ Migration completed successfully!');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end();
}
