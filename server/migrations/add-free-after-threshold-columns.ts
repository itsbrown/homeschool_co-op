import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export async function addFreeAfterThresholdColumns(db: NodePgDatabase) {
  console.log('Running migration: Adding free_after_threshold columns to schools table...');
  
  try {
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS free_after_threshold_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS free_after_threshold INTEGER DEFAULT 3;
    `);
    
    console.log('✅ Migration completed: free_after_threshold columns added to schools table');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}
