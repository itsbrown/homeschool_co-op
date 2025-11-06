import { storage } from '../server/storage';

async function investigateDuplicateEnrollments() {
  try {
    console.log('🔍 Investigating duplicate Macaroni enrollments for jocimarie@gmail.com...\n');

    // Get all enrollments
    const allEnrollments = await storage.getAllEnrollments();
    
    // Filter for jocimarie's enrollments
    const jocimarieEnrollments = allEnrollments.filter((e: any) => 
      e.parentEmail === 'jocimarie@gmail.com'
    );
    
    console.log(`📊 Total enrollments for jocimarie@gmail.com: ${jocimarieEnrollments.length}\n`);
    
    // Filter for Macaroni class enrollments
    const macaroniEnrollments = jocimarieEnrollments.filter((e: any) => 
      e.className && e.className.toLowerCase().includes('macaroni')
    );
    
    console.log(`🍝 Macaroni enrollments: ${macaroniEnrollments.length}\n`);
    
    if (macaroniEnrollments.length > 0) {
      console.log('📋 Details of Macaroni enrollments:\n');
      macaroniEnrollments.forEach((enrollment: any, index: number) => {
        console.log(`${index + 1}. Enrollment ID: ${enrollment.id}`);
        console.log(`   Class Name: ${enrollment.className}`);
        console.log(`   Child Name: ${enrollment.childName}`);
        console.log(`   Payment Status: ${enrollment.paymentStatus}`);
        console.log(`   Enrolled At: ${enrollment.enrolledAt || 'N/A'}`);
        console.log(`   Total Cost: $${(enrollment.totalCost / 100).toFixed(2)}`);
        console.log(`   Total Paid: $${(enrollment.totalPaid / 100).toFixed(2)}`);
        console.log('');
      });
      
      // Group by child name to identify duplicates
      const byChild = macaroniEnrollments.reduce((acc: any, e: any) => {
        const key = e.childName;
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
      console.log('Option 1: Delete specific enrollment IDs manually');
      console.log('   Run: npm run delete-enrollments <id1> <id2> <id3>...\n');
      
      console.log('Option 2: Delete ALL Macaroni enrollments for jocimarie');
      console.log('   Run: npm run delete-macaroni-enrollments\n');
      
      console.log('📋 Enrollment IDs to consider for deletion:');
      macaroniEnrollments.forEach((e: any) => {
        console.log(`   - ID ${e.id}: ${e.className} for ${e.childName} (${e.paymentStatus})`);
      });
    } else {
      console.log('✅ No Macaroni enrollments found.');
    }
    
  } catch (error) {
    console.error('❌ Error investigating enrollments:', error);
    throw error;
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
