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
  
  // Add new constraint with biweekly (allowing NULL)
  console.log('Adding new constraint with biweekly (allowing NULL)...');
  await sql`ALTER TABLE program_enrollments ADD CONSTRAINT program_enrollments_payment_plan_check CHECK (payment_plan IS NULL OR payment_plan IN ('full_payment', 'deposit_only', 'biweekly', 'custom'))`;
  
  console.log('✅ Migration completed successfully!');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end();
}
