
const { storage } = require('./server/storage');

async function testBillingAPI() {
  console.log('Testing billing API...');
  
  try {
    // Test getting children for parent
    const children = await storage.getChildrenByParentEmail('parent@gmail.com');
    console.log('Children found:', children.length);
    
    if (children.length > 0) {
      const childIds = children.map(c => c.id);
      console.log('Child IDs:', childIds);
      
      // Test getting enrollments
      const enrollments = await storage.getEnrollmentsByChildIds(childIds);
      console.log('Enrollments found:', enrollments.length);
      
      // Test getting class details
      if (enrollments.length > 0) {
        const classDetails = await storage.getClassById(enrollments[0].classId);
        console.log('Class details:', classDetails ? 'Found' : 'Not found');
      }
    }
    
    console.log('✅ Billing API test completed successfully');
  } catch (error) {
    console.error('❌ Billing API test failed:', error);
  }
}

testBillingAPI();
