
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';
const TEST_USER_EMAIL = 'corey.e.brown2025@gmail.com';

async function testPaymentPlansFlow() {
  console.log('🧪 Testing Payment Plans Flow...\n');

  try {
    // Step 1: Test if payment plans page loads
    console.log('📄 Step 1: Testing payment plans page access');
    const plansResponse = await fetch(`${BASE_URL}/payment-plans`);
    console.log(`   Status: ${plansResponse.status}`);
    
    if (plansResponse.status === 200) {
      console.log('   ✅ Payment plans page loads successfully');
    } else {
      console.log('   ❌ Payment plans page failed to load');
      return;
    }

    // Step 2: Test billing summary API
    console.log('\n💰 Step 2: Testing billing summary API');
    const authToken = 'Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Im5Fc1ErcklNWC94OG55SE8iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL21vaXZ3anVnbHd3ZnJocWVld2p1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJkZjFjZWE1Ny0yMTNlLTQxNTMtYjZiNS0wNDU4NWQyNTRjNDYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU1MTQ0MjQwLCJpYXQiOjE3NTUxNDA2NDAsImVtYWlsIjoiY29yZXkuZS5icm93bjIwMjVAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImNvcmV5LmUuYnJvd24yMDI1QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6ImRmMWNlYTU3LTIxM2UtNDE1My1iNmI1LTA0NTg1ZDI1NGM0NiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzU1MTQwNjQwfV0sInNlc3Npb25faWQiOiIzODY5YWQxYS1mY2UyLTRjMTQtYWJjZC00NTU5NTU1OTY4MTAiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.O44lcwCSnr_2Rontp_9NMcjxNg-NN2hfEit64EWg2Pg';
    
    const billingResponse = await fetch(`${BASE_URL}/api/billing/summary`, {
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      }
    });
    
    const billingData = await billingResponse.json();
    console.log(`   Status: ${billingResponse.status}`);
    console.log(`   Response:`, JSON.stringify(billingData, null, 2));

    // Step 3: Create test child and enrollment to test payment plans
    console.log('\n👶 Step 3: Creating test child for payment testing');
    
    const testChild = {
      firstName: 'Test',
      lastName: 'Child',
      dateOfBirth: '2015-01-01',
      grade: '3rd',
      parentEmail: TEST_USER_EMAIL,
      medicalInfo: 'None',
      allergies: 'None'
    };

    const childResponse = await fetch(`${BASE_URL}/api/children`, {
      method: 'POST',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testChild)
    });

    const childData = await childResponse.json();
    console.log(`   Child creation status: ${childResponse.status}`);
    
    if (childResponse.status === 201) {
      console.log(`   ✅ Test child created: ${childData.firstName} ${childData.lastName}`);
      
      // Step 4: Get available classes
      console.log('\n📚 Step 4: Getting available classes');
      const classesResponse = await fetch(`${BASE_URL}/api/classes`);
      const classesData = await classesResponse.json();
      
      if (classesData.length > 0) {
        const testClass = classesData[0];
        console.log(`   ✅ Found test class: ${testClass.title} - $${testClass.price/100}`);
        
        // Step 5: Test payment plan calculations
        console.log('\n💳 Step 5: Testing payment plan calculations');
        const fullAmount = testClass.price;
        const depositAmount = Math.round(fullAmount * 0.1);
        const splitAmount = Math.round(fullAmount / 2);
        const monthlyAmount = Math.round(fullAmount / 3);
        
        console.log(`   Full Payment: $${fullAmount/100}`);
        console.log(`   Deposit (10%): $${depositAmount/100}`);
        console.log(`   Split Payment: $${splitAmount/100} x 2`);
        console.log(`   Monthly Payment: $${monthlyAmount/100} x 3`);
        
        // Step 6: Test enrollment creation
        console.log('\n📝 Step 6: Creating test enrollment');
        const enrollmentData = {
          classId: testClass.id,
          childId: childData.id,
          paymentType: 'deposit',
          amount: depositAmount,
          totalCost: fullAmount,
          depositRequired: depositAmount
        };
        
        const enrollmentResponse = await fetch(`${BASE_URL}/api/enrollments`, {
          method: 'POST',
          headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(enrollmentData)
        });
        
        const enrollmentResult = await enrollmentResponse.json();
        console.log(`   Enrollment status: ${enrollmentResponse.status}`);
        
        if (enrollmentResponse.status === 201) {
          console.log(`   ✅ Test enrollment created`);
          
          // Step 7: Test billing summary with enrollment
          console.log('\n📊 Step 7: Testing billing summary with enrollment');
          const updatedBillingResponse = await fetch(`${BASE_URL}/api/billing/summary`, {
            headers: {
              'Authorization': authToken,
              'Content-Type': 'application/json'
            }
          });
          
          const updatedBillingData = await updatedBillingResponse.json();
          console.log(`   Updated billing summary:`, JSON.stringify(updatedBillingData, null, 2));
          
          // Step 8: Test payment intent creation
          console.log('\n💰 Step 8: Testing payment intent creation');
          const paymentData = {
            enrollmentIds: [enrollmentResult.id],
            totalAmount: depositAmount,
            paymentPlan: 'deposit',
            paymentDetails: [{
              enrollmentId: enrollmentResult.id,
              amount: depositAmount,
              childName: `${childData.firstName} ${childData.lastName}`,
              className: testClass.title
            }]
          };
          
          const paymentIntentResponse = await fetch(`${BASE_URL}/api/billing/pay-balance`, {
            method: 'POST',
            headers: {
              'Authorization': authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentData)
          });
          
          const paymentIntentData = await paymentIntentResponse.json();
          console.log(`   Payment intent status: ${paymentIntentResponse.status}`);
          console.log(`   Payment intent data:`, JSON.stringify(paymentIntentData, null, 2));
          
          if (paymentIntentData.success) {
            console.log('   ✅ Payment intent created successfully');
            console.log(`   💳 Client secret: ${paymentIntentData.clientSecret ? 'Present' : 'Missing'}`);
          } else {
            console.log('   ❌ Payment intent creation failed');
          }
        }
      } else {
        console.log('   ❌ No classes available for testing');
      }
    } else {
      console.log(`   ❌ Failed to create test child: ${JSON.stringify(childData)}`);
    }

    console.log('\n🏁 Payment Plans Flow Test Complete');
    
  } catch (error) {
    console.error('❌ Error during payment plans testing:', error);
  }
}

// Run the test
testPaymentPlansFlow();
