import { storage } from '../server/storage';

async function deleteEnrollmentsByIds() {
  try {
    // Get enrollment IDs from command line arguments
    const enrollmentIds = process.argv.slice(2).map(id => parseInt(id)).filter(id => !isNaN(id));
    
    if (enrollmentIds.length === 0) {
      console.log('❌ No enrollment IDs provided.');
      console.log('Usage: npm run delete-enrollments <id1> <id2> <id3>...');
      process.exit(1);
    }
    
    console.log(`🗑️  Preparing to delete ${enrollmentIds.length} enrollment(s)...\n`);
    
    for (const id of enrollmentIds) {
      try {
        // Get enrollment details first
        const enrollment = await storage.getProgramEnrollmentById(id);
        
        if (!enrollment) {
          console.log(`⚠️  Enrollment ID ${id} not found. Skipping.`);
          continue;
        }
        
        console.log(`📝 Deleting enrollment ID ${id}:`);
        console.log(`   Class: ${enrollment.className}`);
        console.log(`   Child: ${enrollment.childName}`);
        console.log(`   Parent: ${enrollment.parentEmail}`);
        console.log(`   Status: ${enrollment.paymentStatus}`);
        
        // Delete the enrollment
        await storage.deleteProgramEnrollment(id);
        
        console.log(`   ✅ Successfully deleted enrollment ID ${id}\n`);
        
      } catch (error) {
        console.error(`   ❌ Error deleting enrollment ID ${id}:`, error);
      }
    }
    
    console.log('\n✅ Deletion process complete');
    
  } catch (error) {
    console.error('❌ Error in deletion process:', error);
    throw error;
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
