/**
 * Test script to verify the AI enrollment assistant workflow
 * This tests the complete flow from child registration to enrollment
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Test token - use a valid Supabase token for testing
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6Im5Gc1ErcklNWC84OG55SE8iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL21vaXZ3anVnbHd3ZnJocWVld2p1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIxNjUyM2ViMC1iOGRiLTQ0YzAtYTg0Zi0wYjVlOTRlYTc4NTIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUyNzgxNzA2LCJpYXQiOjE3NTI3NzgxMDYsImVtYWlsIjoicGFyZW50X3Rlc3RAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InBhcmVudF90ZXN0QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjE2NTIzZWIwLWI4ZGItNDRjMC1hODRmLTBiNWU5NGVhNzg1MiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzUyNDQ3ODkyfV0sInNlc3Npb25faWQiOiIyNDFkMmM2Ny0wMjQwLTRmZTgtODQ5OS04ZTgxMTA0YTdiMjciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.2HL1b-eSqCcLYIMUHbJlNZLoq_fNL7DYsdIm4Sn40mk';

async function makeRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await response.json();
  
  return { response, data };
}

async function testEnrollmentFlow() {
  console.log('🧪 Testing AI Enrollment Assistant Flow');
  console.log('=' .repeat(50));

  try {
    // Step 1: Get initial children count
    console.log('\n1. Getting initial children count...');
    const { data: initialChildren } = await makeRequest('/api/children');
    console.log(`   Initial children count: ${initialChildren.length}`);
    
    // Step 2: Get available programs
    console.log('\n2. Getting available programs...');
    const { data: programs } = await makeRequest('/api/programs');
    console.log(`   Available programs: ${programs.length}`);
    if (programs.length > 0) {
      console.log(`   First program: ${programs[0].title} (ID: ${programs[0].id})`);
    }

    // Step 3: Start AI conversation - request to register child
    console.log('\n3. Starting AI conversation to register child...');
    const { data: step1 } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
      message: 'I want to register my child Maya Smith and enroll them in a program',
      childrenIds: initialChildren.map(c => c.id),
      history: []
    });
    console.log(`   AI Response: ${step1.message.substring(0, 100)}...`);

    // Step 4: Provide child information
    console.log('\n4. Providing child information...');
    const { data: step2 } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
      message: 'Maya Smith is 8 years old, in 3rd grade, and loves science and math',
      childrenIds: initialChildren.map(c => c.id),
      history: [
        { role: 'user', content: 'I want to register my child Maya Smith and enroll them in a program' },
        { role: 'assistant', content: step1.message }
      ]
    });
    console.log(`   AI Response: ${step2.message.substring(0, 100)}...`);

    // Step 5: Complete registration with additional details
    console.log('\n5. Completing registration with details...');
    const { data: step3 } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
      message: 'Yes, please register Maya. Phone: 555-222-3333, Address: 456 Oak Ave Denver CO 80202, Emergency: John Smith 555-111-2222, Medical: No special needs',
      childrenIds: initialChildren.map(c => c.id),
      history: [
        { role: 'user', content: 'I want to register my child Maya Smith and enroll them in a program' },
        { role: 'assistant', content: step1.message },
        { role: 'user', content: 'Maya Smith is 8 years old, in 3rd grade, and loves science and math' },
        { role: 'assistant', content: step2.message }
      ]
    });
    console.log(`   AI Response: ${step3.message.substring(0, 100)}...`);
    console.log(`   Action provided: ${step3.action ? step3.action.type : 'None'}`);

    // Step 6: Confirm registration if AI provides action
    if (step3.action && step3.action.type === 'register_child') {
      console.log('\n6. AI provided registration action, confirming...');
      const { data: step4 } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
        message: 'yes',
        childrenIds: initialChildren.map(c => c.id),
        history: [
          { role: 'user', content: 'I want to register my child Maya Smith and enroll them in a program' },
          { role: 'assistant', content: step1.message },
          { role: 'user', content: 'Maya Smith is 8 years old, in 3rd grade, and loves science and math' },
          { role: 'assistant', content: step2.message },
          { role: 'user', content: 'Yes, please register Maya. Phone: 555-222-3333, Address: 456 Oak Ave Denver CO 80202, Emergency: John Smith 555-111-2222, Medical: No special needs' },
          { role: 'assistant', content: step3.message }
        ]
      });
      console.log(`   Final AI Response: ${step4.message.substring(0, 100)}...`);
    }

    // Step 7: Check if child was actually registered
    console.log('\n7. Checking if child was registered...');
    const { data: finalChildren } = await makeRequest('/api/children');
    console.log(`   Final children count: ${finalChildren.length}`);
    
    const newChild = finalChildren.find(child => 
      child.firstName === 'Maya' && child.lastName === 'Smith'
    );
    
    if (newChild) {
      console.log(`   ✅ SUCCESS: Maya Smith registered with ID: ${newChild.id}`);
      console.log(`   Child details: ${newChild.firstName} ${newChild.lastName}, Grade: ${newChild.gradeLevel}`);
    } else {
      console.log(`   ❌ FAILED: Maya Smith not found in registered children`);
    }

    // Step 8: Test enrollment if child was registered
    if (newChild && programs.length > 0) {
      console.log('\n8. Testing enrollment process...');
      const { data: enrollmentStep } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
        message: `Please enroll Maya Smith in the ${programs[0].title} program`,
        childrenIds: finalChildren.map(c => c.id),
        history: []
      });
      console.log(`   Enrollment AI Response: ${enrollmentStep.message.substring(0, 100)}...`);
      
      if (enrollmentStep.action && enrollmentStep.action.type === 'enroll') {
        console.log(`   ✅ Enrollment action generated for program ${enrollmentStep.action.programId} and child ${enrollmentStep.action.childId}`);
      }
    }

    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testEnrollmentFlow();