
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';

async function testSchoolRegistrationFlow() {
  console.log('🧪 Testing complete school registration and listing flow...\n');

  try {
    // Test 1: Register a new school
    console.log('📝 Step 1: Testing school registration...');
    const schoolData = {
      name: "Test Academy",
      type: "co-op",
      address: "123 Test Street",
      city: "Test City",
      state: "TS",
      zipCode: "12345",
      phoneNumber: "555-123-4567",
      email: "test@testacademy.com",
      website: "https://testacademy.com",
      description: "A test school for verification purposes",
      foundedYear: 2025,
      accreditation: "Test Accreditation",
      enrollmentSize: 50
    };

    const registerResponse = await fetch(`${BASE_URL}/api/schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(schoolData)
    });

    const registerResult = await registerResponse.json();
    console.log('✅ School registration response:', registerResult);
    
    if (registerResponse.ok) {
      console.log(`✅ School registered successfully with ID: ${registerResult.id}`);
    } else {
      console.log('❌ School registration failed:', registerResult.message);
      return;
    }

    // Test 2: Try to fetch all schools (should work without auth)
    console.log('\n📋 Step 2: Testing school list retrieval...');
    const listResponse = await fetch(`${BASE_URL}/api/schools`);
    const schools = await listResponse.json();
    
    if (listResponse.ok) {
      console.log('✅ Schools retrieved successfully:');
      schools.forEach((school, index) => {
        console.log(`   ${index + 1}. ${school.name} (ID: ${school.id})`);
      });
      
      // Check if our test school is in the list
      const testSchool = schools.find(school => school.name === "Test Academy");
      if (testSchool) {
        console.log('✅ Test school found in the list!');
      } else {
        console.log('❌ Test school NOT found in the list');
      }
    } else {
      console.log('❌ Failed to retrieve schools:', schools.message);
    }

    // Test 3: Test school-admin endpoint (this is what's failing)
    console.log('\n🔐 Step 3: Testing school admin endpoint (without auth)...');
    const adminResponse = await fetch(`${BASE_URL}/api/school-admin/my-school`);
    const adminResult = await adminResponse.json();
    
    console.log('School admin endpoint status:', adminResponse.status);
    console.log('School admin endpoint response:', adminResult);

    // Test 4: Check file storage directly
    console.log('\n📁 Step 4: Checking file storage...');
    const fs = require('fs');
    const path = require('path');
    
    const schoolsFilePath = path.join(__dirname, 'data', 'schools.json');
    if (fs.existsSync(schoolsFilePath)) {
      const schoolsFileContent = fs.readFileSync(schoolsFilePath, 'utf8');
      const schoolsFromFile = JSON.parse(schoolsFileContent);
      console.log('✅ Schools in file storage:');
      schoolsFromFile.forEach((school, index) => {
        console.log(`   ${index + 1}. ${school.name} (ID: ${school.id})`);
      });
    } else {
      console.log('❌ Schools file not found');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testSchoolRegistrationFlow();
