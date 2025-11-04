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
  console.log('Adding location targeting fields to custom_forms...');
  await sql`
    ALTER TABLE custom_forms 
    ADD COLUMN IF NOT EXISTS is_all_locations boolean DEFAULT true NOT NULL
  `;
  
  await sql`
    ALTER TABLE custom_forms
    ADD COLUMN IF NOT EXISTS allowed_location_ids integer[]
  `;
  
  console.log('Adding platform fee configuration fields to custom_forms...');
  await sql`
    ALTER TABLE custom_forms
    ADD COLUMN IF NOT EXISTS platform_fee_type text DEFAULT 'none'
  `;
  
  await sql`
    ALTER TABLE custom_forms
    ADD COLUMN IF NOT EXISTS platform_fee_amount integer DEFAULT 0
  `;
  
  // Drop existing constraint if it exists
  await sql`
    ALTER TABLE custom_forms
    DROP CONSTRAINT IF EXISTS custom_forms_platform_fee_type_check
  `;
  
  // Add new constraint
  await sql`
    ALTER TABLE custom_forms
    ADD CONSTRAINT custom_forms_platform_fee_type_check 
    CHECK (platform_fee_type IN ('none', 'flat_per_item', 'percentage'))
  `;
  
  console.log('Adding payment fields to custom_form_submissions...');
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS subtotal integer DEFAULT 0
  `;
  
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS platform_fee integer DEFAULT 0
  `;
  
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS total_amount integer DEFAULT 0
  `;
  
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS payment_status text
  `;
  
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text
  `;
  
  // Drop existing constraint if it exists
  await sql`
    ALTER TABLE custom_form_submissions
    DROP CONSTRAINT IF EXISTS custom_form_submissions_payment_status_check
  `;
  
  // Add new constraint
  await sql`
    ALTER TABLE custom_form_submissions
    ADD CONSTRAINT custom_form_submissions_payment_status_check 
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded'))
  `;
  
  console.log('Adding shipping address field to custom_form_submissions...');
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS shipping_address jsonb
  `;
  
  console.log('Adding product images field to custom_form_submissions...');
  await sql`
    ALTER TABLE custom_form_submissions
    ADD COLUMN IF NOT EXISTS product_images text[]
  `;
  
  console.log('✅ Migration completed successfully!');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end();
}
