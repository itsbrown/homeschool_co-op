
const fetch = require('node-fetch');

async function testEducatorLogin() {
  try {
    console.log('🧑‍🏫 Testing educator login...');
    
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'educator.test@americanseekersacademy.com',
        password: 'password'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Educator login successful!');
      console.log('📧 Email:', result.user.email);
      console.log('👤 Name:', result.user.name);
      console.log('🎯 Role:', result.user.role);
      console.log('🆔 User ID:', result.user.id);
      
      // Test getting user profile
      console.log('\n👤 Testing user profile endpoint...');
      const profileResponse = await fetch('http://localhost:5000/api/auth/me', {
        method: 'GET',
        headers: {
          'Cookie': response.headers.get('set-cookie') || ''
        }
      });
      
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        console.log('✅ Profile data:', profileData);
      } else {
        console.log('❌ Profile fetch failed');
      }
      
    } else {
      console.log('❌ Login failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Error testing educator login:', error.message);
  }
}

// Run the test
console.log('Starting educator login test...');
testEducatorLogin().then(() => {
  console.log('Test completed');
}).catch(error => {
  console.error('Test failed:', error);
});
