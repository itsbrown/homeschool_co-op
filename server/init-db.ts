import { createClassesTable } from './classes-db';
import { getDb } from './db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

// Run database migrations
async function runMigrations() {
  try {
    const db = await getDb();
    
    // Add waitlist_position column if it doesn't exist
    console.log('Running migration: Adding waitlist_position column...');
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD COLUMN IF NOT EXISTS waitlist_position INTEGER;
    `);
    console.log('✅ Migration completed: waitlist_position column added');
    
    // Add class_type column if it doesn't exist
    console.log('Running migration: Adding class_type column...');
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD COLUMN IF NOT EXISTS class_type TEXT NOT NULL DEFAULT 'school_class';
    `);
    // Add constraint if it doesn't exist
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE program_enrollments 
        ADD CONSTRAINT program_enrollments_class_type_check 
        CHECK (class_type IN ('school_class', 'marketplace'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log('✅ Migration completed: class_type column added');
    
    // Add marketplace_class_id column if it doesn't exist
    console.log('Running migration: Adding marketplace_class_id column...');
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD COLUMN IF NOT EXISTS marketplace_class_id INTEGER REFERENCES classes(id);
    `);
    console.log('✅ Migration completed: marketplace_class_id column added');
    
    // Make instructor_id column nullable in programs table
    console.log('Running migration: Making instructor_id nullable in programs table...');
    await db.execute(sql`
      ALTER TABLE programs 
      ALTER COLUMN instructor_id DROP NOT NULL;
    `);
    console.log('✅ Migration completed: instructor_id column now allows null values in programs table');
    
    // Make instructor_id column nullable in classes table
    console.log('Running migration: Making instructor_id nullable in classes table...');
    await db.execute(sql`
      ALTER TABLE classes 
      ALTER COLUMN instructor_id DROP NOT NULL;
    `);
    console.log('✅ Migration completed: instructor_id column now allows null values in classes table');
    
    // Update program_enrollments status constraint to include new lifecycle statuses
    console.log('Running migration: Updating enrollment status constraint...');
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      DROP CONSTRAINT IF EXISTS program_enrollments_status_check;
    `);
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD CONSTRAINT program_enrollments_status_check 
      CHECK (status IN ('pending_payment', 'enrolled', 'waitlist', 'cancelled', 'completed', 'withdrawn', 'failed'));
    `);
    console.log('✅ Migration completed: status constraint now allows pending_payment, waitlist, and cancelled statuses');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Skip migrations if database is not available (file storage mode)
    if (errorMessage.includes('Database connection not available')) {
      console.log('⏭️ Skipping migrations - using file storage mode');
      return;
    }
    
    console.log('Migration note:', errorMessage);
    // Continue even if migration fails (column might already exist)
  }
}

// Initialize database tables
export async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Ensure data directory exists for file-based storage
    // Ensure all required data directories exist
    const dirs = [
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'data/users'),
      path.join(process.cwd(), 'data/knowledge-bases'),
      path.join(process.cwd(), 'data/activities'),
      path.join(process.cwd(), 'data/programs')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
    
    try {
      // Try to create classes table in database
      await createClassesTable();
    } catch (dbError) {
      console.log('Using file-based storage for classes instead of database');
      // Already falling back to file-based storage, handled in class-storage.ts
    }
    
    // Run database migrations
    await runMigrations();
    
    console.log('Database/storage initialization complete.');
  } catch (error) {
    console.error('Error during initialization:', error);
    console.log('Continuing with file-based storage as fallback');
  }
}