
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
      
      // Test educator classes endpoint
      console.log('\n📚 Testing educator classes endpoint...');
      const classesResponse = await fetch(`http://localhost:5000/api/educator/classes?email=${result.user.email}`);
      const classesData = await classesResponse.json();
      
      console.log(`✅ Found ${classesData.length} classes assigned to educator`);
      classesData.forEach(cls => {
        console.log(`  - ${cls.title} (ID: ${cls.id})`);
      });
      
      // Test educator students endpoint
      console.log('\n👥 Testing educator students endpoint...');
      const studentsResponse = await fetch(`http://localhost:5000/api/educator/students?email=${result.user.email}`);
      const studentsData = await studentsResponse.json();
      
      console.log(`✅ Found ${studentsData.totalStudents} students in educator's classes`);
      
    } else {
      console.log('❌ Login failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Error testing educator login:', error);
  }
}

testEducatorLogin();
