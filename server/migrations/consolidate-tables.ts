import { Pool } from 'pg';

/**
 * Migration Script: Consolidate Programs and Classes Tables
 * 
 * This script:
 * 1. Adds new columns to the classes table from the programs table
 * 2. Copies all data from programs to classes with type='marketplace'
 * 3. Updates program_enrollments foreign keys to point to classes.id
 * 4. Adds indexes for performance
 */

async function runMigration() {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting table consolidation migration...');
    
    // Start transaction
    await client.query('BEGIN');
    
    // Step 1: Add new columns to classes table
    console.log('📝 Step 1: Adding new columns to classes table...');
    
    await client.query(`
      ALTER TABLE classes
      ADD COLUMN IF NOT EXISTS type text DEFAULT 'school_admin' NOT NULL,
      ADD COLUMN IF NOT EXISTS legacy_program_id integer UNIQUE,
      ADD COLUMN IF NOT EXISTS age_range text,
      ADD COLUMN IF NOT EXISTS schedule_type text,
      ADD COLUMN IF NOT EXISTS schedule_details jsonb,
      ADD COLUMN IF NOT EXISTS location_name text,
      ADD COLUMN IF NOT EXISTS location_address text,
      ADD COLUMN IF NOT EXISTS is_virtual boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS meeting_url text,
      ADD COLUMN IF NOT EXISTS curriculum_id integer REFERENCES curricula(id),
      ADD COLUMN IF NOT EXISTS cover_image text,
      ADD COLUMN IF NOT EXISTS materials jsonb
    `);
    
    console.log('✅ New columns added successfully (including legacy_program_id for safe ID mapping)');
    
    // Step 2: Check for existing data in programs table
    const programCount = await client.query('SELECT COUNT(*) FROM programs');
    console.log(`📊 Found ${programCount.rows[0].count} programs to migrate`);
    
    if (parseInt(programCount.rows[0].count) > 0) {
      // Step 3: Copy data from programs to classes (idempotent - uses legacy_program_id)
      console.log('📦 Step 2: Copying data from programs to classes...');
      
      const insertResult = await client.query(`
        INSERT INTO classes (
          type,
          legacy_program_id,
          school_id,
          location_id,
          title,
          description,
          category,
          grade_levels,
          start_date,
          end_date,
          schedule,
          capacity,
          price,
          instructor_id,
          is_published,
          age_range,
          schedule_type,
          schedule_details,
          location_name,
          location_address,
          is_virtual,
          meeting_url,
          curriculum_id,
          cover_image,
          materials,
          created_at,
          updated_at
        )
        SELECT 
          'marketplace' as type,
          id as legacy_program_id,
          school_id,
          location_id,
          title,
          description,
          category,
          grade_levels,
          start_date::date,
          end_date::date,
          schedule_details as schedule,
          capacity,
          price,
          instructor_id,
          is_published,
          age_range,
          schedule_type,
          schedule_details,
          location_name,
          location_address,
          is_virtual,
          meeting_url,
          curriculum_id,
          cover_image,
          materials,
          created_at,
          updated_at
        FROM programs
        WHERE id NOT IN (SELECT legacy_program_id FROM classes WHERE legacy_program_id IS NOT NULL)
      `);
      
      console.log(`✅ Data copied successfully - ${insertResult.rowCount} new rows inserted`);
      
      // Step 4: Validate migration - ensure all programs were copied
      console.log('🔍 Step 3: Validating migration completeness...');
      
      const unmappedPrograms = await client.query(`
        SELECT COUNT(*) 
        FROM programs p
        WHERE NOT EXISTS (
          SELECT 1 FROM classes c 
          WHERE c.legacy_program_id = p.id
        )
      `);
      
      if (parseInt(unmappedPrograms.rows[0].count) > 0) {
        throw new Error(`Migration validation failed: ${unmappedPrograms.rows[0].count} programs were not migrated!`);
      }
      
      console.log('✅ All programs migrated successfully');
      
      // Step 5: Update program_enrollments to reference classes.id using deterministic mapping
      console.log('🔄 Step 4: Updating program_enrollments foreign keys...');
      
      const enrollmentUpdateResult = await client.query(`
        UPDATE program_enrollments pe
        SET program_id = c.id
        FROM classes c
        WHERE c.legacy_program_id = pe.program_id
        AND c.type = 'marketplace'
      `);
      
      console.log(`✅ Updated ${enrollmentUpdateResult.rowCount} enrollment foreign keys`);
      
      // Step 6: Validate enrollments - ensure no orphaned records
      console.log('🔍 Step 5: Validating enrollment integrity...');
      
      const orphanedEnrollments = await client.query(`
        SELECT COUNT(*) 
        FROM program_enrollments pe
        LEFT JOIN classes c ON pe.program_id = c.id
        WHERE c.id IS NULL
      `);
      
      if (parseInt(orphanedEnrollments.rows[0].count) > 0) {
        throw new Error(`Migration validation failed: ${orphanedEnrollments.rows[0].count} orphaned enrollments detected!`);
      }
      
      console.log('✅ All enrollments validated - no orphaned records');
    } else {
      console.log('ℹ️  No programs to migrate - skipping data copy');
    }
    
    // Step 6: Add indexes for performance
    console.log('⚡ Step 5: Adding indexes for performance...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_classes_type ON classes(type);
      CREATE INDEX IF NOT EXISTS idx_classes_type_school ON classes(type, school_id);
      CREATE INDEX IF NOT EXISTS idx_classes_published ON classes(type, is_published);
    `);
    
    console.log('✅ Indexes created successfully');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('📊 Summary:');
    console.log(`   - Programs migrated: ${programCount.rows[0].count}`);
    console.log(`   - Type discriminator added: ✅`);
    console.log(`   - Indexes created: ✅`);
    console.log(`   - Foreign keys updated: ✅`);
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { runMigration };

// Run migration if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runMigration()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}
