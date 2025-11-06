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

async function findJocimarieEnrollments() {
  // Create database connection
  const pool = new Pool({
    connectionString: buildDatabaseUrl(),
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Searching for enrollments with "joci" in parent email...\n');

    // Query enrollments with joci in email
    const result = await pool.query(`
      SELECT 
        id,
        class_name,
        child_name,
        parent_email,
        payment_status,
        total_cost,
        enrollment_date,
        created_at
      FROM program_enrollments
      WHERE LOWER(parent_email) LIKE '%joci%'
      ORDER BY created_at DESC
      LIMIT 100
    `);
    
    const enrollments = result.rows;
    console.log(`📊 Found ${enrollments.length} enrollments with "joci" in email\n`);
    
    if (enrollments.length > 0) {
      // Group by parent email
      const byEmail: any = {};
      enrollments.forEach((e: any) => {
        if (!byEmail[e.parent_email]) {
          byEmail[e.parent_email] = [];
        }
        byEmail[e.parent_email].push(e);
      });
      
      console.log('📧 Enrollments grouped by email:\n');
      Object.entries(byEmail).forEach(([email, enrolls]: [string, any]) => {
        console.log(`\n📧 ${email} (${enrolls.length} enrollments):`);
        
        // Show Macaroni enrollments for this email
        const macaroni = enrolls.filter((e: any) => 
          e.class_name && e.class_name.toLowerCase().includes('macaroni')
        );
        
        if (macaroni.length > 0) {
          console.log(`   🍝 ${macaroni.length} Macaroni enrollment(s):`);
          macaroni.forEach((e: any) => {
            console.log(`      - ID ${e.id}: ${e.class_name} for ${e.child_name} (${e.payment_status})`);
          });
        }
        
        // Show all class names for this email
        const classNames = [...new Set(enrolls.map((e: any) => e.class_name))];
        console.log(`   📚 Classes: ${classNames.join(', ')}`);
      });
      
    } else {
      console.log('❌ No enrollments found with "joci" in email');
      console.log('\n🔍 Checking all parent emails in database...\n');
      
      const emailsResult = await pool.query(`
        SELECT DISTINCT parent_email
        FROM program_enrollments
        ORDER BY parent_email
        LIMIT 50
      `);
      
      console.log('📧 Sample parent emails in database:');
      emailsResult.rows.forEach((row: any) => {
        console.log(`   - ${row.parent_email}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error searching enrollments:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

findJocimarieEnrollments()
  .then(() => {
    console.log('\n✅ Search complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Search failed:', error);
    process.exit(1);
  });
