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

async function deleteEnrollmentsByIds() {
  // Get enrollment IDs from command line arguments
  const enrollmentIds = process.argv.slice(2).map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (enrollmentIds.length === 0) {
    console.log('❌ No enrollment IDs provided.');
    console.log('Usage: npx tsx scripts/delete-enrollments-by-id-db.ts <id1> <id2> <id3>...');
    process.exit(1);
  }
  
  // Create database connection
  const pool = new Pool({
    connectionString: buildDatabaseUrl(),
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log(`🗑️  Preparing to delete ${enrollmentIds.length} enrollment(s)...\n`);
    
    for (const id of enrollmentIds) {
      try {
        // Get enrollment details first
        const result = await pool.query(`
          SELECT id, class_name, child_name, parent_email, payment_status
          FROM program_enrollments
          WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
          console.log(`⚠️  Enrollment ID ${id} not found. Skipping.`);
          continue;
        }
        
        const enrollment = result.rows[0];
        
        console.log(`📝 Deleting enrollment ID ${id}:`);
        console.log(`   Class: ${enrollment.class_name}`);
        console.log(`   Child: ${enrollment.child_name}`);
        console.log(`   Parent: ${enrollment.parent_email}`);
        console.log(`   Status: ${enrollment.payment_status}`);
        
        // Delete the enrollment
        await pool.query('DELETE FROM program_enrollments WHERE id = $1', [id]);
        
        console.log(`   ✅ Successfully deleted enrollment ID ${id}\n`);
        
      } catch (error) {
        console.error(`   ❌ Error deleting enrollment ID ${id}:`, error);
      }
    }
    
    console.log('\n✅ Deletion process complete');
    
  } catch (error) {
    console.error('❌ Error in deletion process:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

deleteEnrollmentsByIds()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deletion failed:', error);
    process.exit(1);
  });
