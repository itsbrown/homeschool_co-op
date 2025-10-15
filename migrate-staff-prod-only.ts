import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function migrateStaff() {
  const staffData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/staff.json'), 'utf8'));
  console.log(`📋 Migrating ${staffData.length} staff members to production database...\n`);
  
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
        console.log(`  ✓ User exists: ${staff.name} (${staff.email})`);
      } else {
        // Create user account for staff member
        const hashedPassword = await bcrypt.hash('StaffDefault123!', 10);
        const newUserResult = await client.query(`
          INSERT INTO users (
            username, email, password, role, name, school_id, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          staff.email.split('@')[0] + '_' + Date.now(),
          staff.email,
          hashedPassword,
          'teacher',
          staff.name,
          1, // ASA school ID
          staff.status === 'Active'
        ]);
        userId = newUserResult.rows[0].id;
        console.log(`  + Created user: ${staff.name} (${staff.email}) - ID: ${userId}`);
      }
      
      // Check if staff record exists
      const staffCheck = await client.query(
        'SELECT id FROM school_staff WHERE user_id = $1 AND school_id = $2',
        [userId, 1]
      );
      
      if (staffCheck.rows.length === 0) {
        // Insert into school_staff table
        await client.query(`
          INSERT INTO school_staff (
            school_id, location_id, user_id, role, position, department, 
            start_date, is_active, permissions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          1, // ASA school ID
          staff.locationId ? parseInt(staff.locationId) : null,
          userId,
          'staff', // Map to school_staff enum
          staff.role, // Store actual position (Mentor, Aide, etc.)
          staff.department,
          new Date(staff.joinDate),
          staff.status === 'Active',
          JSON.stringify({ classIds: staff.classIds || [], phone: staff.phone, avatar: staff.avatar })
        ]);
        console.log(`  ✅ Migrated to school_staff: ${staff.name}`);
      } else {
        console.log(`  ⏭️  Already exists: ${staff.name}`);
      }
    }
    
    const count = await client.query('SELECT COUNT(*) FROM school_staff');
    console.log(`\n🎉 Migration complete! Total staff in database: ${count.rows[0].count}`);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateStaff().catch(console.error);
