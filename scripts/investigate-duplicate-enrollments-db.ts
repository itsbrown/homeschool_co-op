import pg from 'pg';

const { Pool } = pg;

// Build properly URL-encoded connection string
function buildDatabaseUrl(): string {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
    throw new Error('Missing required database environment variables');
  }
  
  const encodedUser = encodeURIComponent(PGUSER);
  const encodedPassword = encodeURIComponent(PGPASSWORD);
  const port = PGPORT || '5432';
  
  return `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}`;
}

async function investigateDuplicateEnrollments() {
  // Create database connection
  const pool = new Pool({
    connectionString: buildDatabaseUrl(),
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Investigating duplicate Macaroni enrollments for jocimarie@gmail.com...\n');

    // Query all enrollments for jocimarie
    const result = await pool.query(`
      SELECT 
        id,
        school_id,
        class_name,
        child_name,
        parent_email,
        payment_status,
        total_cost,
        total_paid,
        enrollment_date,
        class_type,
        variant_id,
        created_at
      FROM program_enrollments
      WHERE parent_email = $1
      ORDER BY created_at DESC
    `, ['jocimarie@gmail.com']);
    
    const allEnrollments = result.rows;
    console.log(`📊 Total enrollments for jocimarie@gmail.com: ${allEnrollments.length}\n`);
    
    // Filter for Macaroni class enrollments
    const macaroniEnrollments = allEnrollments.filter((e: any) => 
      e.class_name && e.class_name.toLowerCase().includes('macaroni')
    );
    
    console.log(`🍝 Macaroni enrollments: ${macaroniEnrollments.length}\n`);
    
    if (macaroniEnrollments.length > 0) {
      console.log('📋 Details of Macaroni enrollments:\n');
      macaroniEnrollments.forEach((enrollment: any, index: number) => {
        console.log(`${index + 1}. Enrollment ID: ${enrollment.id}`);
        console.log(`   Class Name: ${enrollment.class_name}`);
        console.log(`   Child Name: ${enrollment.child_name}`);
        console.log(`   Payment Status: ${enrollment.payment_status}`);
        console.log(`   Enrollment Date: ${enrollment.enrollment_date || enrollment.created_at || 'N/A'}`);
        console.log(`   Total Cost: $${(enrollment.total_cost / 100).toFixed(2)}`);
        console.log(`   Total Paid: $${(enrollment.total_paid / 100).toFixed(2)}`);
        console.log('');
      });
      
      // Group by child name to identify duplicates
      const byChild = macaroniEnrollments.reduce((acc: any, e: any) => {
        const key = e.child_name;
        if (!acc[key]) acc[key] = [];
        acc[key].push(e);
        return acc;
      }, {});
      
      console.log('\n📊 Grouped by child:\n');
      Object.entries(byChild).forEach(([childName, enrollments]: [string, any]) => {
        console.log(`${childName}: ${enrollments.length} enrollment(s)`);
        if (enrollments.length > 1) {
          console.log('   ⚠️  DUPLICATE DETECTED!');
        }
      });
      
      console.log('\n\n💡 To remove these duplicates, you have two options:\n');
      console.log('Option 1: Delete specific enrollment IDs');
      console.log('   Example: npx tsx scripts/delete-enrollments-by-id.ts <id1> <id2> <id3>...\n');
      
      console.log('📋 Enrollment IDs for consideration:');
      macaroniEnrollments.forEach((e: any) => {
        console.log(`   - ID ${e.id}: ${e.class_name} for ${e.child_name} (${e.payment_status})`);
      });
      
      // Also show summary by class and child
      console.log('\n\n📊 Summary by Class and Child:');
      const summary: any = {};
      macaroniEnrollments.forEach((e: any) => {
        const key = `${e.class_name} - ${e.child_name}`;
        if (!summary[key]) {
          summary[key] = [];
        }
        summary[key].push(e.id);
      });
      
      Object.entries(summary).forEach(([key, ids]: [string, any]) => {
        if (ids.length > 1) {
          console.log(`\n⚠️  ${key}:`);
          console.log(`   ${ids.length} duplicate enrollments with IDs: ${ids.join(', ')}`);
          console.log(`   💡 Keep ONE and delete the others`);
        }
      });
      
    } else {
      console.log('✅ No Macaroni enrollments found.');
    }
    
  } catch (error) {
    console.error('❌ Error investigating enrollments:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

investigateDuplicateEnrollments()
  .then(() => {
    console.log('\n✅ Investigation complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Investigation failed:', error);
    process.exit(1);
  });
