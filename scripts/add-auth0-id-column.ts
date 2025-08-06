
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function addAuth0IdColumn() {
  try {
    console.log('🔄 Adding auth0_id column to users table...');
    
    // Add the auth0_id column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS auth0_id VARCHAR(255) UNIQUE;
    `);
    
    // Add index for better performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_users_auth0_id ON users(auth0_id);
    `);
    
    console.log('✅ Successfully added auth0_id column and index');
    
    // Optionally, add supabase_id column for future use
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS supabase_id VARCHAR(255) UNIQUE;
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_id);
    `);
    
    console.log('✅ Successfully added supabase_id column and index');
    
  } catch (error) {
    console.error('❌ Error adding auth0_id column:', error);
    throw error;
  }
}

// Run the migration if called directly
if (require.main === module) {
  addAuth0IdColumn()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

export { addAuth0IdColumn };
