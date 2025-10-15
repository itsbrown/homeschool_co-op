import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const devPool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/\?.*$/, '') || ''
});

const prodPool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function migrateStaff() {
  // Read staff from JSON file
  const staffData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/staff.json'), 'utf8'));
  console.log(`📋 Found ${staffData.length} staff members to migrate\n`);
  
  for (const pool of [devPool, prodPool]) {
    const envName = pool === devPool ? 'DEVELOPMENT' : 'PRODUCTION';
    console.log(`\n🔄 Migrating to ${envName} database...`);
    
    const client = await pool.connect();
    try {
      for (const staff of staffData) {
        // Check if user exists by email
        const userResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [staff.email]
        );
        
        let userId;
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
          console.log(`  ✓ User exists for ${staff.email}`);
        } else {
          // Create user account for staff
          const hashedPassword = await bcrypt.hash('StaffDefault123!', 10);
          const newUserResult = await client.query(`
            INSERT INTO users (
              username, email, password, role, name, school_id, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
          `, [
            staff.email.split('@')[0],
            staff.email,
            hashedPassword,
            'teacher',
            staff.name,
            1, // American Seekers Academy
            staff.status === 'Active'
          ]);
          userId = newUserResult.rows[0].id;
          console.log(`  + Created user for ${staff.email} (ID: ${userId})`);
        }
        
        // Check if staff record exists
        const staffCheck = await client.query(
          'SELECT id FROM school_staff WHERE user_id = $1 AND school_id = $2',
          [userId, 1]
        );
        
        if (staffCheck.rows.length === 0) {
          // Insert into school_staff
          await client.query(`
            INSERT INTO school_staff (
              school_id, location_id, user_id, role, position, department, 
              start_date, is_active, permissions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            1, // American Seekers Academy
            staff.locationId ? parseInt(staff.locationId) : null,
            userId,
            'staff', // Map to school_staff enum
            staff.role, // Store actual role in position
            staff.department,
            new Date(staff.joinDate),
            staff.status === 'Active',
            JSON.stringify({ classIds: staff.classIds || [] })
          ]);
          console.log(`  ✅ Migrated ${staff.name} to school_staff`);
        } else {
          console.log(`  ⏭️  ${staff.name} already exists in school_staff`);
        }
      }
      
      console.log(`\n✅ ${envName} migration complete!`);
    } catch (error: any) {
      console.error(`❌ ${envName} migration failed:`, error.message);
    } finally {
      client.release();
    }
  }
  
  await devPool.end();
  await prodPool.end();
  console.log('\n🎉 Staff migration completed for both environments!');
}

migrateStaff().catch(console.error);
