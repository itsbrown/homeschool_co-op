import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('🔄 Adding payment frequency fields to program_enrollments...');
  
  const db = await getDb();
  
  try {
    // Add payment_frequency column
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD COLUMN IF NOT EXISTS payment_frequency text DEFAULT 'one_time'
    `);
    console.log('✅ Added payment_frequency column');
    
    // Add program start/end date columns
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD COLUMN IF NOT EXISTS program_start_date date
    `);
    console.log('✅ Added program_start_date column');
    
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD COLUMN IF NOT EXISTS program_end_date date
    `);
    console.log('✅ Added program_end_date column');
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
