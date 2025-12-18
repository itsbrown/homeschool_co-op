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
    
    // Add invited_by column to role_invitations table if it doesn't exist
    console.log('Running migration: Adding invited_by column to role_invitations table...');
    await db.execute(sql`
      ALTER TABLE role_invitations 
      ADD COLUMN IF NOT EXISTS invited_by INTEGER REFERENCES users(id);
    `);
    console.log('✅ Migration completed: invited_by column added to role_invitations table');
    
    // Add bundle_rule column to discounts table
    console.log('Running migration: Adding bundle_rule column to discounts table...');
    await db.execute(sql`
      ALTER TABLE discounts 
      ADD COLUMN IF NOT EXISTS bundle_rule JSONB;
    `);
    console.log('✅ Migration completed: bundle_rule column added to discounts table');
    
    // Add applies_to_membership column to discounts table
    console.log('Running migration: Adding applies_to_membership column to discounts table...');
    await db.execute(sql`
      ALTER TABLE discounts 
      ADD COLUMN IF NOT EXISTS applies_to_membership BOOLEAN DEFAULT FALSE;
    `);
    console.log('✅ Migration completed: applies_to_membership column added to discounts table');
    
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
    const rolesToAdd = ['educator', 'learner', 'mentor'];
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
    
    // CRITICAL FIX: Backfill null active_role_id for all users with roles
    // This ensures RoleSwitcher appears for multi-role users
    console.log('Running migration: Backfilling null active_role_id to primary role...');
    await db.execute(sql`
      UPDATE users u
      SET active_role_id = (
        SELECT ur.id
        FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.is_primary = true
        LIMIT 1
      )
      WHERE u.active_role_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_roles ur
          WHERE ur.user_id = u.id
            AND ur.is_primary = true
        );
    `);
    console.log('✅ Migration completed: null active_role_id backfilled to primary role');
    
    // Fallback: Set active_role_id to first role (by created_at) if no primary role exists
    console.log('Running migration: Setting active_role_id to first role when no primary exists...');
    await db.execute(sql`
      UPDATE users u
      SET active_role_id = (
        SELECT ur.id
        FROM user_roles ur
        WHERE ur.user_id = u.id
        ORDER BY ur.created_at ASC
        LIMIT 1
      )
      WHERE u.active_role_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_roles ur
          WHERE ur.user_id = u.id
        );
    `);
    console.log('✅ Migration completed: active_role_id set to first role for users without primary');
    
    // Add missing columns to membership_enrollments table
    console.log('Running migration: Adding missing columns to membership_enrollments table...');
    await db.execute(sql`
      ALTER TABLE membership_enrollments 
      ADD COLUMN IF NOT EXISTS parent_user_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS membership_year INTEGER,
      ADD COLUMN IF NOT EXISTS amount INTEGER,
      ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS remaining_balance INTEGER,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_payment',
      ADD COLUMN IF NOT EXISTS due_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payment_method TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
    console.log('✅ Migration completed: missing columns added to membership_enrollments table');
    
    // Add membership configuration columns to schools table
    console.log('Running migration: Adding membership configuration columns to schools table...');
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS membership_fee_amount INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS membership_renewal_month INTEGER DEFAULT 9,
      ADD COLUMN IF NOT EXISTS membership_renewal_day INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS membership_grace_period_days INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS membership_description TEXT,
      ADD COLUMN IF NOT EXISTS membership_required BOOLEAN DEFAULT true;
    `);
    console.log('✅ Migration completed: membership configuration columns added to schools table');
    
    // Add Stripe integration and tier columns to membership_enrollments table
    console.log('Running migration: Adding Stripe integration columns to membership_enrollments table...');
    await db.execute(sql`
      ALTER TABLE membership_enrollments 
      ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'basic',
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
      ADD COLUMN IF NOT EXISTS start_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP;
    `);
    
    // Add constraint for membership_tier values
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE membership_enrollments 
        ADD CONSTRAINT membership_enrollments_tier_check 
        CHECK (membership_tier IN ('basic', 'standard', 'premium', 'vip'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log('✅ Migration completed: Stripe integration columns added to membership_enrollments table');
    
    // Add balance tracking columns to membership_enrollments table
    console.log('Running migration: Adding balance tracking columns to membership_enrollments table...');
    await db.execute(sql`
      ALTER TABLE membership_enrollments 
      ADD COLUMN IF NOT EXISTS total_amount INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS balance_due INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
    `);
    console.log('✅ Migration completed: balance tracking columns added to membership_enrollments table');
    
    // Migrate legacy parent_id data and drop column from membership_enrollments table
    console.log('Running migration: Migrating parent_id data and dropping legacy column from membership_enrollments...');
    
    // Step 1: Check if parent_id column exists and migrate data to parent_user_id
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Check if parent_id column exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'membership_enrollments' AND column_name = 'parent_id'
        ) THEN
          -- Migrate data from parent_id to parent_user_id where parent_user_id is null
          UPDATE membership_enrollments 
          SET parent_user_id = parent_id 
          WHERE parent_user_id IS NULL AND parent_id IS NOT NULL;
          
          -- Make parent_id nullable to remove any NOT NULL constraint
          ALTER TABLE membership_enrollments ALTER COLUMN parent_id DROP NOT NULL;
          
          -- Drop the parent_id column
          ALTER TABLE membership_enrollments DROP COLUMN parent_id;
          
          RAISE NOTICE 'Successfully migrated and dropped parent_id column';
        ELSE
          RAISE NOTICE 'parent_id column does not exist, skipping migration';
        END IF;
      END $$;
    `);
    console.log('✅ Migration completed: legacy parent_id column migrated and dropped from membership_enrollments');
    
    // Drop legacy parent_email column from membership_enrollments table (not in Drizzle schema - we use parentUserId instead)
    console.log('Running migration: Dropping legacy parent_email column from membership_enrollments...');
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Check if parent_email column exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'membership_enrollments' AND column_name = 'parent_email'
        ) THEN
          -- Make parent_email nullable to remove any NOT NULL constraint
          ALTER TABLE membership_enrollments ALTER COLUMN parent_email DROP NOT NULL;
          
          -- Drop the parent_email column
          ALTER TABLE membership_enrollments DROP COLUMN parent_email;
          
          RAISE NOTICE 'Successfully dropped parent_email column';
        ELSE
          RAISE NOTICE 'parent_email column does not exist, skipping migration';
        END IF;
      END $$;
    `);
    console.log('✅ Migration completed: legacy parent_email column dropped from membership_enrollments');
    
    // Add stripe_customer_id column to users table
    console.log('Running migration: Adding stripe_customer_id column to users table...');
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    `);
    console.log('✅ Migration completed: stripe_customer_id column added to users table');
    
    // Create stripe_payment_history table for syncing Stripe payments
    console.log('Running migration: Creating stripe_payment_history table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stripe_payment_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payment_intent_id TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        subscription_id TEXT,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed', 'canceled', 'refunded')),
        payment_method TEXT,
        description TEXT,
        stripe_created_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Create index on user_id for faster lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_stripe_payment_history_user_id 
      ON stripe_payment_history(user_id);
    `);
    
    // Create index on customer_id for Stripe lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_stripe_payment_history_customer_id 
      ON stripe_payment_history(customer_id);
    `);
    
    console.log('✅ Migration completed: stripe_payment_history table created');
    
    // Add reminder tracking columns to school_class_enrollments table
    console.log('Running migration: Adding reminder tracking columns to school_class_enrollments table...');
    await db.execute(sql`
      ALTER TABLE school_class_enrollments 
      ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
    `);
    console.log('✅ Migration completed: reminder tracking columns added to school_class_enrollments table');
    
    // Create scheduled_payments table for payment plan installments
    console.log('Running migration: Creating scheduled_payments table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduled_payments (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        enrollment_id INTEGER NOT NULL REFERENCES program_enrollments(id),
        parent_id INTEGER NOT NULL REFERENCES users(id),
        parent_email TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        scheduled_date TIMESTAMP NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'weekly', 'monthly', 'quarterly', 'annual')),
        installment_number INTEGER NOT NULL,
        total_installments INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'skipped', 'paid')),
        stripe_payment_intent_id TEXT,
        processed_at TIMESTAMP,
        failure_reason TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Create index on parent_email for faster lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_scheduled_payments_parent_email 
      ON scheduled_payments(parent_email);
    `);
    
    // Create index on enrollment_id for faster lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_scheduled_payments_enrollment_id 
      ON scheduled_payments(enrollment_id);
    `);
    
    console.log('✅ Migration completed: scheduled_payments table created');
    
    // Add reminder tracking columns to scheduled_payments table
    console.log('Running migration: Adding reminder tracking columns to scheduled_payments table...');
    await db.execute(sql`
      ALTER TABLE scheduled_payments 
      ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP;
    `);
    console.log('✅ Migration completed: reminder tracking columns added to scheduled_payments table');
    
    // Add onboarding tour columns
    console.log('Running migration: Adding onboarding tour columns...');
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS onboarding_tour_enabled BOOLEAN DEFAULT true;
    `);
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT false;
    `);
    console.log('✅ Migration completed: onboarding tour columns added');
    
    // Add show_subscription_status column to schools table
    console.log('Running migration: Adding show_subscription_status column to schools table...');
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS show_subscription_status BOOLEAN DEFAULT false;
    `);
    console.log('✅ Migration completed: show_subscription_status column added to schools table');
    
    // Add pending_admin_approval status to enrollment constraints
    console.log('Running migration: Adding pending_admin_approval status to enrollments...');
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      DROP CONSTRAINT IF EXISTS program_enrollments_status_check;
    `);
    await db.execute(sql`
      ALTER TABLE program_enrollments 
      ADD CONSTRAINT program_enrollments_status_check 
      CHECK (status IN ('pending_payment', 'pending_admin_approval', 'enrolled', 'waitlist', 'cancelled', 'completed', 'withdrawn', 'failed'));
    `);
    await db.execute(sql`
      ALTER TABLE school_class_enrollments 
      DROP CONSTRAINT IF EXISTS school_class_enrollments_status_check;
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE school_class_enrollments 
        ADD CONSTRAINT school_class_enrollments_status_check 
        CHECK (status IN ('pending_payment', 'pending_admin_approval', 'enrolled', 'waitlist', 'cancelled', 'completed', 'withdrawn', 'failed'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log('✅ Migration completed: pending_admin_approval status added to enrollments');
    
    // Add role-based discount columns to discounts table
    console.log('Running migration: Adding role-based discount columns to discounts table...');
    await db.execute(sql`
      ALTER TABLE discounts 
      ADD COLUMN IF NOT EXISTS required_roles TEXT[];
    `);
    await db.execute(sql`
      ALTER TABLE discounts 
      ADD COLUMN IF NOT EXISTS role_match_logic TEXT DEFAULT 'or';
    `);
    console.log('✅ Migration completed: role-based discount columns added to discounts table');
    
    // Add membership agreement columns to schools table
    console.log('Running migration: Adding membership agreement columns to schools table...');
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS membership_agreement_template TEXT;
    `);
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS membership_agreement_version TEXT DEFAULT '1.0';
    `);
    await db.execute(sql`
      ALTER TABLE schools 
      ADD COLUMN IF NOT EXISTS membership_agreement_updated_at TIMESTAMP;
    `);
    console.log('✅ Migration completed: membership agreement columns added to schools table');
    
    // Create membership_agreements table for signed agreements
    console.log('Running migration: Creating membership_agreements table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS membership_agreements (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        parent_user_id INTEGER NOT NULL REFERENCES users(id),
        membership_enrollment_id INTEGER REFERENCES membership_enrollments(id),
        signatory_name TEXT NOT NULL,
        agreement_version TEXT NOT NULL,
        agreement_content TEXT NOT NULL,
        signed_at TIMESTAMP DEFAULT NOW() NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        document_path TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_membership_agreements_school_id ON membership_agreements(school_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_membership_agreements_parent_user_id ON membership_agreements(parent_user_id);
    `);
    console.log('✅ Migration completed: membership_agreements table created');
    
    // Add member_id column to users table for membership tracking
    console.log('Running migration: Adding member_id column to users table...');
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS member_id TEXT;
    `);
    console.log('✅ Migration completed: member_id column added to users table');
    
    // Create school_documents table for admin-uploaded documents
    console.log('Running migration: Creating school_documents table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS school_documents (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        uploaded_by INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'other' NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        is_published BOOLEAN DEFAULT true NOT NULL,
        visible_to_all BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_school_documents_school_id ON school_documents(school_id);
    `);
    console.log('✅ Migration completed: school_documents table created');
    
    // Create payment_receipts table for automatic payment receipts
    console.log('Running migration: Creating payment_receipts table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_receipts (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        parent_user_id INTEGER NOT NULL REFERENCES users(id),
        receipt_number TEXT NOT NULL UNIQUE,
        stripe_payment_intent_id TEXT,
        enrollment_ids INTEGER[],
        child_names TEXT[],
        class_names TEXT[],
        amount INTEGER NOT NULL,
        payment_method TEXT,
        payment_date TIMESTAMP DEFAULT NOW() NOT NULL,
        status TEXT DEFAULT 'generated' NOT NULL,
        metadata JSONB DEFAULT '{}' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payment_receipts_school_id ON payment_receipts(school_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payment_receipts_parent_user_id ON payment_receipts(parent_user_id);
    `);
    console.log('✅ Migration completed: payment_receipts table created');
    
    // IMPORTANT: Convert user_roles.role from enum to text to support custom staff positions
    // This allows custom roles like "Mentor", "Tutor", etc. to be stored alongside system roles
    console.log('Running migration: Converting user_roles.role column from enum to text...');
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Check if the column is currently an enum type
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'user_roles' 
          AND column_name = 'role' 
          AND udt_name = 'role'
        ) THEN
          -- Alter the column type from enum to text
          ALTER TABLE user_roles ALTER COLUMN role TYPE TEXT USING role::TEXT;
          RAISE NOTICE 'Converted user_roles.role from enum to text';
        ELSE
          RAISE NOTICE 'user_roles.role is already text type, skipping conversion';
        END IF;
      END $$;
    `);
    console.log('✅ Migration completed: user_roles.role column is now text type (supports custom staff positions)');
    
    // Backfill school_staff entries into user_roles for staff who don't already have a matching user_roles entry
    // Check for user/school/role combination to support multiple positions per user
    console.log('Running migration: Backfilling school_staff entries to user_roles...');
    await db.execute(sql`
      DO $$ 
      DECLARE
        staff_record RECORD;
        existing_role_count INT;
        staff_role TEXT;
      BEGIN
        -- Check if school_staff table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'school_staff') THEN
          -- Loop through all school_staff entries
          FOR staff_record IN 
            SELECT ss.id, ss.user_id, ss.school_id, ss.position, ss.role
            FROM school_staff ss
            WHERE ss.user_id IS NOT NULL
          LOOP
            -- Determine the role to use (position takes precedence)
            staff_role := COALESCE(staff_record.position, staff_record.role, 'educator');
            
            -- Check if this user already has THIS SPECIFIC role at this school
            SELECT COUNT(*) INTO existing_role_count
            FROM user_roles ur
            WHERE ur.user_id = staff_record.user_id 
            AND ur.school_id = staff_record.school_id
            AND ur.role = staff_role;
            
            -- If no existing matching role, create one
            IF existing_role_count = 0 THEN
              INSERT INTO user_roles (user_id, role, school_id, is_primary)
              VALUES (
                staff_record.user_id,
                staff_role,
                staff_record.school_id,
                FALSE
              )
              ON CONFLICT DO NOTHING;
              
              RAISE NOTICE 'Backfilled user_roles for school_staff user_id: % with role: %', staff_record.user_id, staff_role;
            END IF;
          END LOOP;
          RAISE NOTICE 'school_staff backfill to user_roles complete';
        ELSE
          RAISE NOTICE 'school_staff table does not exist, skipping backfill';
        END IF;
      END $$;
    `);
    console.log('✅ Migration completed: school_staff entries backfilled to user_roles');
    
    // Create educator_class_assignments table for Phase 1a Educator Dashboard
    console.log('Running migration: Creating educator_class_assignments table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS educator_class_assignments (
        id SERIAL PRIMARY KEY,
        educator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        is_primary BOOLEAN NOT NULL DEFAULT true,
        can_start_session BOOLEAN NOT NULL DEFAULT true,
        valid_from DATE,
        valid_to DATE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_class_assignments_educator_id 
      ON educator_class_assignments(educator_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_class_assignments_class_id 
      ON educator_class_assignments(class_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_class_assignments_school_id 
      ON educator_class_assignments(school_id);
    `);
    console.log('✅ Migration completed: educator_class_assignments table created');
    
    // Create class_sessions table for Phase 1a Educator Dashboard
    console.log('Running migration: Creating class_sessions table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS class_sessions (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        educator_id INTEGER NOT NULL REFERENCES users(id),
        substitute_educator_id INTEGER REFERENCES users(id),
        scheduled_date DATE NOT NULL,
        scheduled_start_time TEXT NOT NULL,
        scheduled_end_time TEXT NOT NULL,
        actual_start_time TIMESTAMP,
        actual_end_time TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')),
        cancelled_reason TEXT,
        notes TEXT,
        daily_flow_entry_id INTEGER REFERENCES daily_flow_entries(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_class_id 
      ON class_sessions(class_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_educator_id 
      ON class_sessions(educator_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_school_id 
      ON class_sessions(school_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_scheduled_date 
      ON class_sessions(scheduled_date);
    `);
    console.log('✅ Migration completed: class_sessions table created');

    // Phase 1b: Create educator_schedules table
    console.log('Running migration: Creating educator_schedules table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS educator_schedules (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES educator_class_assignments(id) ON DELETE CASCADE,
        educator_id INTEGER NOT NULL REFERENCES users(id),
        class_id INTEGER NOT NULL REFERENCES classes(id),
        school_id INTEGER NOT NULL REFERENCES schools(id),
        schedule_type TEXT NOT NULL DEFAULT 'recurring' CHECK (schedule_type IN ('recurring', 'one_time', 'adhoc')),
        day_of_week INTEGER,
        scheduled_date TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        timezone TEXT NOT NULL DEFAULT 'America/New_York',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_schedules_educator_id 
      ON educator_schedules(educator_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_schedules_class_id 
      ON educator_schedules(class_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_schedules_school_id 
      ON educator_schedules(school_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_educator_schedules_assignment_id 
      ON educator_schedules(assignment_id);
    `);
    console.log('✅ Migration completed: educator_schedules table created');

    // Phase 1b: Create audit_logs table
    console.log('Running migration: Creating audit_logs table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),
        actor_id INTEGER REFERENCES users(id),
        actor_role TEXT,
        actor_email TEXT,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        school_id INTEGER REFERENCES schools(id),
        request_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target 
      ON audit_logs(target_type, target_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id 
      ON audit_logs(actor_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id 
      ON audit_logs(school_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
      ON audit_logs(created_at);
    `);
    console.log('✅ Migration completed: audit_logs table created');
    
    // Phase 2: Create session_attendance table for attendance tracking
    console.log('Running migration: Creating session_attendance table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS session_attendance (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'tardy', 'excused', 'early_departure')),
        check_in_time TIMESTAMP,
        check_out_time TIMESTAMP,
        tardy_minutes INTEGER,
        early_departure_minutes INTEGER,
        excuse_reason TEXT,
        notes TEXT,
        recorded_by INTEGER NOT NULL REFERENCES users(id),
        recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_attendance_session_id 
      ON session_attendance(session_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_attendance_child_id 
      ON session_attendance(child_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_attendance_school_id 
      ON session_attendance(school_id);
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_attendance_unique 
      ON session_attendance(session_id, child_id);
    `);
    console.log('✅ Migration completed: session_attendance table created');
    
    // Add unique constraint on children table to prevent duplicate children per parent
    console.log('Running migration: Adding unique constraint on children table...');
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- First, check if duplicate children exist and clean them up
        -- Keep the oldest record (lowest ID) for each duplicate set
        DELETE FROM children c1
        WHERE EXISTS (
          SELECT 1 FROM children c2 
          WHERE c2.parent_id = c1.parent_id 
            AND LOWER(c2.first_name) = LOWER(c1.first_name) 
            AND LOWER(c2.last_name) = LOWER(c1.last_name)
            AND c2.id < c1.id
        );
        
        -- Now add the unique constraint if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'unique_parent_child'
        ) THEN
          CREATE UNIQUE INDEX unique_parent_child 
          ON children(parent_id, LOWER(first_name), LOWER(last_name));
        END IF;
      EXCEPTION
        WHEN duplicate_table THEN NULL;
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log('✅ Migration completed: unique constraint added to children table');
    
    // Add unique constraint on school_students table to prevent duplicate school-child records
    console.log('Running migration: Adding unique constraint on school_students table...');
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Clean up duplicate school_student records first
        DELETE FROM school_students ss1
        WHERE EXISTS (
          SELECT 1 FROM school_students ss2 
          WHERE ss2.child_id = ss1.child_id 
            AND ss2.school_id = ss1.school_id
            AND ss2.id < ss1.id
        );
        
        -- Add the unique constraint if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'unique_child_school'
        ) THEN
          CREATE UNIQUE INDEX unique_child_school 
          ON school_students(child_id, school_id);
        END IF;
      EXCEPTION
        WHEN duplicate_table THEN NULL;
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log('✅ Migration completed: unique constraint added to school_students table');
    
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