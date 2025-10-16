/**
 * Script to add the missing permissions column to the users table
 */
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function addPermissionsColumn() {
  try {
    console.log('🔧 Adding permissions column to users table...');
    
    const db = await getDb();
    
    // Add the permissions column if it doesn't exist
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb NOT NULL
    `);
    
    console.log('✅ Successfully added permissions column to users table');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding permissions column:', error);
    process.exit(1);
  }
}

addPermissionsColumn();
