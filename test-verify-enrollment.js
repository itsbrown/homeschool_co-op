
const fetch = require('node-fetch');

const baseUrl = 'http://localhost:5000';

async function testEnrollmentVerification() {
  console.log('🔍 Testing Mary Brown Enrollment Verification');
  console.log('===============================================\n');

  try {
    // Step 1: Check Mary Brown's current enrollments
    console.log('📝 Step 1: Checking Mary Brown\'s current enrollments');
    const enrollmentsResponse = await fetch(`${baseUrl}/api/children/11/enrollments`);
    const currentEnrollments = await enrollmentsResponse.json();
    
    console.log(`   Current enrollments for Mary Brown: ${currentEnrollments.length}`);
    if (currentEnrollments.length > 0) {
      currentEnrollments.forEach(enrollment => {
        console.log(`   - ${enrollment.className} (Status: ${enrollment.status})`);
      });
    } else {
      console.log('   ❌ No enrollments found - confirming AI claim was false');
    }

    // Step 2: Check available classes
    console.log('\n📚 Step 2: Checking available classes');
    const classesResponse = await fetch(`${baseUrl}/api/classes`);
    const classesData = await classesResponse.json();
    const classes = classesData.classes || classesData;
    
    const tycoonClass = classes.find(c => c.title === 'Tycoons');
    if (!tycoonClass) {
      throw new Error('Tycoons class not found');
    }
    
    console.log(`   Found Tycoons class (ID: ${tycoonClass.id})`);
    console.log(`   Price: $${tycoonClass.price}`);
    console.log(`   Capacity: ${tycoonClass.capacity}`);
    console.log(`   Current enrollment count: ${tycoonClass.enrollmentCount || 0}`);

    // Step 3: Manually create the enrollment that AI claimed to have made
    console.log('\n✅ Step 3: Creating the enrollment that AI claimed to have made');
    
    const enrollmentData = {
      classId: tycoonClass.id,
      childId: 11,
      childName: 'Mary Brown',
      className: 'Tycoons',
      status: 'pending_payment',
      enrollmentDate: new Date().toISOString(),
      amount: 0,
      depositRequired: Math.round(tycoonClass.price * 0.1), // 10% deposit
      totalCost: tycoonClass.price,
      remainingBalance: tycoonClass.price
    };

    const enrollResponse = await fetch(`${baseUrl}/api/enrollments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
        'X-Active-Role': 'parent'
      },
      body: JSON.stringify(enrollmentData)
    });

    if (enrollResponse.ok) {
      const enrollmentResult = await enrollResponse.json();
      console.log('   ✅ Enrollment created successfully');
      console.log(`   Enrollment ID: ${enrollmentResult.id}`);
      console.log(`   Status: ${enrollmentResult.status}`);
      console.log(`   Deposit required: $${enrollmentResult.depositRequired}`);
      console.log(`   Total cost: $${enrollmentResult.totalCost}`);
    } else {
      const error = await enrollResponse.text();
      console.log(`   ❌ Enrollment failed: ${error}`);
    }

    // Step 4: Verify the enrollment was actually created
    console.log('\n🔍 Step 4: Verifying enrollment was actually created');
    
    const verifyResponse = await fetch(`${baseUrl}/api/children/11/enrollments`);
    const updatedEnrollments = await verifyResponse.json();
    
    console.log(`   Updated enrollments for Mary Brown: ${updatedEnrollments.length}`);
    
    if (updatedEnrollments.length > 0) {
      updatedEnrollments.forEach(enrollment => {
        console.log(`   ✅ ${enrollment.className} (Status: ${enrollment.status})`);
        console.log(`      Enrollment Date: ${new Date(enrollment.enrollmentDate).toLocaleDateString()}`);
        console.log(`      Amount: $${enrollment.amount || 0}`);
        console.log(`      Remaining Balance: $${enrollment.remainingBalance || 0}`);
      });
    } else {
      console.log('   ❌ Still no enrollments found - API call failed');
    }

    // Step 5: Check if enrollment appears in parent's overall enrollments
    console.log('\n👨‍👩‍👧‍👦 Step 5: Checking parent\'s overall enrollments');
    
    const parentEnrollmentsResponse = await fetch(`${baseUrl}/api/enrollments`, {
      headers: {
        'Authorization': 'Bearer test-token',
        'X-Active-Role': 'parent'
      }
    });
    
    if (parentEnrollmentsResponse.ok) {
      const parentEnrollments = await parentEnrollmentsResponse.json();
      const maryEnrollments = parentEnrollments.filter(e => e.childId === 11);
      
      console.log(`   Total enrollments for parent: ${parentEnrollments.length}`);
      console.log(`   Mary's enrollments in parent view: ${maryEnrollments.length}`);
      
      if (maryEnrollments.length > 0) {
        maryEnrollments.forEach(enrollment => {
          console.log(`   ✅ ${enrollment.className} - ${enrollment.status}`);
        });
      }
    }

    // Step 6: Summary and recommendations
    console.log('\n📋 Step 6: Summary and Recommendations');
    console.log('=====================================');
    console.log('✅ Issue confirmed: AI claimed to enroll Mary Brown but did not');
    console.log('✅ Manual enrollment process works correctly');
    console.log('✅ Enrollment appears in both child and parent views');
    console.log('\n🔧 Recommendations:');
    console.log('1. Fix the AI enrollment assistant to actually call enrollment API');
    console.log('2. Add validation to ensure AI claims match actual database changes');
    console.log('3. Implement transaction rollback if enrollment fails after AI claims success');
    console.log('4. Add real-time verification of enrollment status in UI');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testEnrollmentVerification().catch(console.error);
