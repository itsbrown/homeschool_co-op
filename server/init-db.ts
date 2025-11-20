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
    
    // Add "Free After Threshold" discount configuration columns to schools table
    console.log('Running migration: Adding free_after_threshold columns to schools table...');
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS free_after_threshold_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS free_after_threshold INTEGER DEFAULT 3;
    `);
    console.log('✅ Migration completed: free_after_threshold columns added to schools table');
    
    // Add is_active column to role_invitations table for pending invitation tracking
    console.log('Running migration: Adding is_active column to role_invitations table...');
    await db.execute(sql`
      ALTER TABLE role_invitations 
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
    `);
    console.log('✅ Migration completed: is_active column added to role_invitations table');
    
    // Rename used column to used_at in role_invitations table to match schema
    console.log('Running migration: Renaming used column to used_at in role_invitations table...');
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'role_invitations' AND column_name = 'used') THEN
          ALTER TABLE role_invitations RENAME COLUMN used TO used_at;
        END IF;
      END $$;
    `);
    console.log('✅ Migration completed: used column renamed to used_at in role_invitations table');
    
    // Add bundle_rule column to discounts table
    console.log('Running migration: Adding bundle_rule column to discounts table...');
    await db.execute(sql`
      ALTER TABLE discounts 
      ADD COLUMN IF NOT EXISTS bundle_rule JSONB;
    `);
    console.log('✅ Migration completed: bundle_rule column added to discounts table');
    
    // Create categories table for school-specific class categorization
    console.log('Running migration: Creating categories table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_categories_school_id ON categories(school_id);
    `);
    console.log('✅ Migration completed: categories table created');
    
    // Clean up duplicate categories (keep only the first occurrence)
    console.log('Running migration: Cleaning up duplicate categories...');
    await db.execute(sql`
      DELETE FROM categories c1
      USING categories c2
      WHERE c1.id > c2.id
        AND c1.school_id = c2.school_id
        AND c1.name = c2.name;
    `);
    console.log('✅ Migration completed: duplicate categories cleaned up');
    
    // Create unique constraint on (school_id, name)
    console.log('Running migration: Adding unique constraint to categories...');
    try {
      await db.execute(sql`
        ALTER TABLE categories 
        ADD CONSTRAINT categories_school_id_name_unique UNIQUE (school_id, name);
      `);
      console.log('✅ Migration completed: unique constraint added to categories');
    } catch (constraintError) {
      // Constraint already exists, which is fine
      console.log('✅ Migration completed: unique constraint already exists on categories');
    }
    
    // Seed default categories for all existing schools
    console.log('Running migration: Seeding default categories for existing schools...');
    await db.execute(sql`
      INSERT INTO categories (school_id, name, description, is_active)
      SELECT 
        id as school_id,
        category_name,
        NULL as description,
        true as is_active
      FROM schools
      CROSS JOIN (
        VALUES 
          ('Early Childhood'),
          ('Kindergarten'),
          ('Lower Elementary'),
          ('Upper Elementary'),
          ('Middle School'),
          ('High School'),
          ('All Ages'),
          ('Summer Camp')
      ) AS default_categories(category_name)
      ON CONFLICT (school_id, name) DO NOTHING;
    `);
    console.log('✅ Migration completed: default categories seeded for all schools');
    
    // Add category_id column to classes table
    console.log('Running migration: Adding category_id column to classes table...');
    await db.execute(sql`
      ALTER TABLE classes 
      ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);
    `);
    console.log('✅ Migration completed: category_id column added to classes table');
    
    // Map existing category strings to category IDs
    console.log('Running migration: Mapping existing class categories to category IDs...');
    await db.execute(sql`
      UPDATE classes c
      SET category_id = cat.id
      FROM categories cat
      WHERE c.school_id = cat.school_id
        AND c.category_id IS NULL
        AND (
          (c.category ILIKE '%early%childhood%' AND cat.name = 'Early Childhood')
          OR (c.category ILIKE 'kindergarten' AND cat.name = 'Kindergarten')
          OR (c.category ILIKE '%lower%elementary%' AND cat.name = 'Lower Elementary')
          OR (c.category ILIKE '%upper%elementary%' AND cat.name = 'Upper Elementary')
          OR (c.category ILIKE '%middle%school%' AND cat.name = 'Middle School')
          OR (c.category ILIKE '%high%school%' AND cat.name = 'High School')
          OR (c.category ILIKE '%summer%camp%' AND cat.name = 'Summer Camp')
          OR (c.category ILIKE '%all%ages%' AND cat.name = 'All Ages')
        );
    `);
    
    // Map any remaining unmapped classes to "All Ages" as fallback
    await db.execute(sql`
      UPDATE classes c
      SET category_id = cat.id
      FROM categories cat
      WHERE c.school_id = cat.school_id
        AND c.category_id IS NULL
        AND cat.name = 'All Ages';
    `);
    console.log('✅ Migration completed: existing class categories mapped to category IDs');
    
    // Fix discount ID sequence to prevent duplicate key errors
    console.log('Running migration: Fixing discounts table ID sequence...');
    try {
      await db.execute(sql`
        SELECT setval(pg_get_serial_sequence('discounts', 'id'), COALESCE((SELECT MAX(id) FROM discounts), 0) + 1, false);
      `);
      console.log('✅ Migration completed: discounts ID sequence fixed');
    } catch (seqError) {
      console.log('Migration note: Could not fix discounts sequence:', seqError instanceof Error ? seqError.message : String(seqError));
    }
    
    // Add multi-role support: active_role column to users table
    console.log('Running migration: Adding active_role column to users table...');
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS active_role TEXT;
    `);
    console.log('✅ Migration completed: active_role column added to users table');
    
    // Create role enum type if it doesn't exist
    console.log('Running migration: Creating role enum type...');
    try {
      await db.execute(sql`
        DO $$ BEGIN
          CREATE TYPE role AS ENUM ('student', 'parent', 'learner', 'educator', 'teacher', 'schoolAdmin', 'admin', 'superAdmin');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
      console.log('✅ Migration completed: role enum type created');
    } catch (enumError) {
      console.log('✅ Migration completed: role enum type already exists');
    }
    
    // Add missing role values to existing role enum if they don't exist
    console.log('Running migration: Adding missing role values to enum...');
    const rolesToAdd = ['educator', 'learner'];
    for (const roleValue of rolesToAdd) {
      try {
        await db.execute(sql.raw(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '${roleValue}' AND enumtypid = 'role'::regtype) THEN
              ALTER TYPE role ADD VALUE '${roleValue}';
            END IF;
          END $$;
        `));
        console.log(`✅ Migration completed: ${roleValue} value added to role enum`);
      } catch (roleError) {
        console.log(`✅ Migration completed: ${roleValue} value already exists in role enum`);
      }
    }
    
    // Create user_roles table for multi-role assignments
    console.log('Running migration: Creating user_roles table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role role NOT NULL,
        school_id INTEGER,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_user_roles_school_id ON user_roles(school_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON user_roles(user_id, role);
    `);
    
    // Add unique constraint to prevent duplicate role assignments
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_user_role 
      ON user_roles(user_id, role, COALESCE(school_id, 0));
    `);
    console.log('✅ Migration completed: user_roles table created');
    
    // Populate user_roles from existing users.role column (data migration)
    console.log('Running migration: Populating user_roles from existing users...');
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role, school_id, is_primary)
      SELECT 
        id as user_id,
        role::role,
        school_id,
        true as is_primary
      FROM users
      WHERE id NOT IN (SELECT DISTINCT user_id FROM user_roles)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Migration completed: user_roles populated from existing users');
    
    // Add active_role_id column to users table for persisting active role ID across reloads
    console.log('Running migration: Adding active_role_id column to users table...');
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS active_role_id INTEGER REFERENCES user_roles(id);
    `);
    console.log('✅ Migration completed: active_role_id column added to users table');
    
    // Backfill active_role_id from existing active_role + user_roles mapping
    console.log('Running migration: Backfilling active_role_id from active_role...');
    await db.execute(sql`
      UPDATE users u
      SET active_role_id = ur.id
      FROM user_roles ur
      WHERE u.id = ur.user_id
        AND u.active_role IS NOT NULL
        AND u.active_role = ur.role::text
        AND u.active_role_id IS NULL
        AND COALESCE(ur.school_id, 0) = COALESCE(u.school_id, 0);
    `);
    console.log('✅ Migration completed: active_role_id backfilled from existing active_role');
    
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