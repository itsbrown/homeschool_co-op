import { readFileSync } from 'fs';
import { getDb } from './db';
import { sql } from 'drizzle-orm';

async function migrateMarketplaceClassEnrollments() {
  console.log('🚀 Starting marketplace class enrollments migration...');
  
  try {
    const db = await getDb();

    // Create the marketplace_class_enrollments table
    console.log('📋 Creating marketplace_class_enrollments table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS marketplace_class_enrollments (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id),
        child_id INTEGER NOT NULL REFERENCES children(id),
        child_name TEXT,
        class_name TEXT,
        enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'enrolled', 'completed', 'withdrawn', 'waitlist')),
        waitlist_position INTEGER,
        amount INTEGER NOT NULL DEFAULT 0,
        deposit_required INTEGER NOT NULL DEFAULT 0,
        total_cost INTEGER NOT NULL,
        remaining_balance INTEGER NOT NULL,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Table created successfully');

    // Read enrollments.json
    const enrollmentsData = JSON.parse(readFileSync('data/enrollments.json', 'utf-8'));
    console.log(`📝 Found ${enrollmentsData.length} enrollments to migrate`);

    // Check which children and classes exist
    const childrenResult = await db.execute(sql`SELECT id FROM children`);
    const validChildIds = new Set(childrenResult.map((row: any) => row.id));
    console.log(`👶 Valid child IDs in database: ${Array.from(validChildIds).join(', ') || 'none'}`);
    
    const classesResult = await db.execute(sql`SELECT id FROM classes`);
    const validClassIds = new Set(classesResult.map((row: any) => row.id));
    console.log(`📚 Valid class IDs in database: ${Array.from(validClassIds).join(', ') || 'none'}`);

    // Insert enrollments (let database auto-generate IDs instead of using timestamp-based IDs)
    let skippedCount = 0;
    for (const enrollment of enrollmentsData) {
      // Check if child and class exist
      if (!validChildIds.has(enrollment.childId)) {
        console.log(`⚠️  Skipping enrollment (old ID: ${enrollment.id}): references non-existent childId=${enrollment.childId}`);
        skippedCount++;
        continue;
      }
      
      if (!validClassIds.has(enrollment.classId)) {
        console.log(`⚠️  Skipping enrollment (old ID: ${enrollment.id}): references non-existent classId=${enrollment.classId}`);
        skippedCount++;
        continue;
      }
      
      const result = await db.execute(sql`
        INSERT INTO marketplace_class_enrollments (
          class_id, child_id, child_name, class_name, enrollment_date, 
          status, waitlist_position, amount, deposit_required, total_cost, 
          remaining_balance, created_at, updated_at
        ) VALUES (
          ${enrollment.classId},
          ${enrollment.childId},
          ${enrollment.childName || null},
          ${enrollment.className || null},
          ${enrollment.enrollmentDate},
          ${enrollment.status},
          ${enrollment.waitlistPosition || null},
          ${enrollment.amount},
          ${enrollment.depositRequired},
          ${enrollment.totalCost},
          ${enrollment.remainingBalance},
          ${enrollment.enrollmentDate},
          ${enrollment.enrollmentDate}
        )
        RETURNING id
      `);
      
      console.log(`✅ Migrated enrollment (old ID: ${enrollment.id}): ${enrollment.childName} - ${enrollment.className}`);
    }
    
    if (skippedCount > 0) {
      console.log(`⚠️  Skipped ${skippedCount} enrollment records with invalid references`);
    }

    console.log('✨ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateMarketplaceClassEnrollments();
