
/**
 * Test script to verify school knowledge base integration with enrollment assistant
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
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

async function testSchoolKnowledgeIntegration() {
  console.log('🧪 Testing School Knowledge Base Integration with Enrollment Assistant');
  console.log('=' .repeat(70));

  try {
    // Test 1: Check if knowledge bases are available
    console.log('\n1. Checking available knowledge bases...');
    const { data: knowledgeBases } = await makeRequest('/api/schools/knowledge-bases');
    console.log(`   Found ${knowledgeBases.length} knowledge bases`);
    
    if (knowledgeBases.length > 0) {
      console.log(`   First KB: "${knowledgeBases[0].title}"`);
    }

    // Test 2: Ask enrollment assistant about school policies
    console.log('\n2. Testing school policy questions...');
    const policyQuestions = [
      'What are your attendance policies?',
      'Tell me about your tuition and payment policies',
      'What is your curriculum philosophy?',
      'What are the school hours and schedule?'
    ];

    for (const question of policyQuestions) {
      console.log(`\n   Testing question: "${question}"`);
      const { data: response } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
        message: question,
        childrenIds: [],
        history: []
      });
      
      console.log(`   AI Response (first 100 chars): ${response.message?.substring(0, 100) || 'No response'}...`);
      
      // Check if response contains school-specific information
      const hasSchoolInfo = response.message && (
        response.message.toLowerCase().includes('american seekers') ||
        response.message.toLowerCase().includes('academy') ||
        response.message.toLowerCase().includes('policy') ||
        response.message.toLowerCase().includes('curriculum')
      );
      
      console.log(`   Contains school info: ${hasSchoolInfo ? '✅' : '❌'}`);
    }

    // Test 3: Ask about programs with context
    console.log('\n3. Testing program questions with school context...');
    const { data: programResponse } = await makeRequest('/api/ai/enrollment-assistant', 'POST', {
      message: 'What programs do you offer and how do they align with your educational philosophy?',
      childrenIds: [],
      history: []
    });
    
    console.log(`   Program response (first 150 chars): ${programResponse.message?.substring(0, 150) || 'No response'}...`);
    
    const hasContextualInfo = programResponse.message && (
      programResponse.message.toLowerCase().includes('philosophy') ||
      programResponse.message.toLowerCase().includes('approach') ||
      programResponse.message.toLowerCase().includes('methodology')
    );
    
    console.log(`   Includes contextual school info: ${hasContextualInfo ? '✅' : '❌'}`);

    console.log('\n✅ School knowledge base integration test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSchoolKnowledgeIntegration();
