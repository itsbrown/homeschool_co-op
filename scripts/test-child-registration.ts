import fetch from 'node-fetch';

// Test child registration flow
async function testChildRegistration() {
  try {
    console.log('Starting test of child registration flow...');
    
    // Step 1: Login with parent account
    console.log('1. Logging in with parent account...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'parent',
        password: 'password'
      })
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}\n${errorText}`);
    }

    const loginData = await loginResponse.json();
    console.log('Login successful:', loginData.message);

    // Get cookies from response
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No session cookie received from server');
    }
    console.log('Session cookie received');

    // Step 2: Register a child
    console.log('\n2. Registering a new child...');
    const childData = {
      firstName: 'Test',
      lastName: 'Child',
      birthdate: '2018-01-01',
      gradeLevel: '1st Grade',
      school: 'Test Elementary School',
      specialNeeds: null,
      allergies: 'None',
      medicalInfo: 'No medical issues',
      learningStyle: 'Visual',
      interests: ['Science', 'Art'],
      profileImage: null
    };

    const registerResponse = await fetch('http://localhost:5000/api/children', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': setCookieHeader
      },
      body: JSON.stringify(childData)
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      throw new Error(`Child registration failed: ${registerResponse.status} ${registerResponse.statusText}\n${errorText}`);
    }

    const newChild = await registerResponse.json();
    console.log('Child registered successfully:', newChild);
    
    // Step 3: Verify the child was created by retrieving it
    console.log('\n3. Verifying child was created...');
    const verifyResponse = await fetch('http://localhost:5000/api/children', {
      headers: {
        'Cookie': setCookieHeader
      }
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      throw new Error(`Verification failed: ${verifyResponse.status} ${verifyResponse.statusText}\n${errorText}`);
    }

    const children = await verifyResponse.json();
    console.log('Retrieved children:', children);

    if (children.length > 0) {
      console.log('Child registration flow tested successfully!');
    } else {
      console.log('No children found in the database.');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testChildRegistration();