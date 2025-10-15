import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function seedProduction() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding production database...\n');
    
    // Create school
    console.log('📚 Creating American Seekers Academy...');
    const schoolResult = await client.query(`
      INSERT INTO schools (
        name, type, admin_id, city, state, zip_code, email, 
        description, is_verified, status, registration_code,
        membership_fee_amount, membership_renewal_month, membership_renewal_day,
        membership_grace_period_days, membership_required
      ) VALUES (
        'American Seekers Academy',
        'homeschool',
        1,
        'Orlando',
        'FL',
        '32801',
        'admin@americanseekersacademy.com',
        'Innovative homeschool learning platform serving families with adaptive education',
        true,
        'active',
        'ASA2025',
        10000,
        9,
        1,
        30,
        true
      )
      RETURNING id
    `);
    const schoolId = schoolResult.rows[0].id;
    console.log(`✅ School created with ID: ${schoolId}`);
    
    // Create super admin user
    console.log('\n👤 Creating super admin user...');
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    
    await client.query(`
      INSERT INTO users (
        username, email, password, role, name, 
        school_id, is_active, subscription
      ) VALUES (
        'superadmin',
        'admin@americanseekersacademy.com',
        $1,
        'superAdmin',
        'ASA Administrator',
        $2,
        true,
        'free'
      )
    `, [hashedPassword, schoolId]);
    console.log('✅ Super admin created');
    console.log('   Email: admin@americanseekersacademy.com');
    console.log('   Password: Admin123!');
    
    console.log('\n🎉 Production database seeded successfully!');
    console.log('\n📝 Production Credentials:');
    console.log('   School: American Seekers Academy (ASA2025)');
    console.log('   Admin: admin@americanseekersacademy.com / Admin123!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedProduction().catch(console.error);
