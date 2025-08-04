
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

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());

    const result = await response.json();
    console.log('Response body:', result);
    
    if (response.ok && result.user) {
      console.log('✅ Educator login successful!');
      console.log('📧 Email:', result.user.email);
      console.log('👤 Name:', result.user.name);
      console.log('🎯 Role:', result.user.role);
      console.log('🆔 User ID:', result.user.id);
      
      // Test getting user profile with session cookie
      console.log('\n👤 Testing user profile endpoint...');
      const cookies = response.headers.get('set-cookie');
      console.log('Session cookies:', cookies);
      
      if (cookies) {
        const profileResponse = await fetch('http://localhost:5000/api/auth/me', {
          method: 'GET',
          headers: {
            'Cookie': cookies
          }
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          console.log('✅ Profile data:', profileData);
        } else {
          console.log('❌ Profile fetch failed:', profileResponse.status);
          const errorData = await profileResponse.json();
          console.log('Profile error:', errorData);
        }
      }
      
    } else {
      console.log('❌ Login failed:', result.message);
      console.log('Full response:', result);
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
  console.error('Test error:', error);
});
