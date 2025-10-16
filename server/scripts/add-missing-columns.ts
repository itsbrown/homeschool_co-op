/**
 * Script to add missing columns to the users table
 */
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function addMissingColumns() {
  try {
    console.log('🔧 Adding missing columns to users table...');
    
    const db = await getDb();
    
    // Add the school_id column if it doesn't exist
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS school_id INTEGER
    `);
    
    console.log('✅ Successfully added school_id column');
    
    // Add other columns that might be missing
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone TEXT
    `);
    
    console.log('✅ Successfully added phone column');
    
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS emergency_contact_first_name TEXT
    `);
    
    console.log('✅ Successfully added emergency_contact_first_name column');
    
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS emergency_contact_last_name TEXT
    `);
    
    console.log('✅ Successfully added emergency_contact_last_name column');
    
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT
    `);
    
    console.log('✅ Successfully added emergency_contact_phone column');
    
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS emergency_contact_email TEXT
    `);
    
    console.log('✅ Successfully added emergency_contact_email column');
    
    console.log('✅ All missing columns added successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding columns:', error);
    process.exit(1);
  }
}

addMissingColumns();
