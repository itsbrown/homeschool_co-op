
const fs = require('fs');
const path = require('path');

function testSchoolPersistence() {
  console.log('🧪 Testing school data persistence...\n');
  
  const schoolsFilePath = path.join(__dirname, 'data', 'schools.json');
  
  try {
    // Check if schools file exists
    if (!fs.existsSync(schoolsFilePath)) {
      console.log('❌ Schools file does not exist at:', schoolsFilePath);
      return;
    }
    
    // Read and parse schools file
    const schoolsFileContent = fs.readFileSync(schoolsFilePath, 'utf8');
    let schools;
    
    try {
      schools = JSON.parse(schoolsFileContent);
    } catch (parseError) {
      console.log('❌ Error parsing schools file:', parseError.message);
      return;
    }
    
    console.log('✅ Schools file found and parsed successfully');
    console.log(`📊 Total schools in file: ${schools.length}\n`);
    
    // Display each school
    schools.forEach((school, index) => {
      console.log(`🏫 School ${index + 1}:`);
      console.log(`   Name: ${school.name}`);
      console.log(`   ID: ${school.id}`);
      console.log(`   Type: ${school.type || 'Not specified'}`);
      console.log(`   Email: ${school.email || 'Not specified'}`);
      console.log(`   Created: ${school.createdAt || 'Not specified'}`);
      console.log('');
    });
    
    // Check for recent additions
    const recentSchools = schools.filter(school => {
      if (!school.createdAt) return false;
      const createdDate = new Date(school.createdAt);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return createdDate > oneDayAgo;
    });
    
    if (recentSchools.length > 0) {
      console.log(`✅ Found ${recentSchools.length} recently added school(s):`);
      recentSchools.forEach(school => {
        console.log(`   - ${school.name} (added ${school.createdAt})`);
      });
    } else {
      console.log('ℹ️ No schools added in the last 24 hours');
    }
    
  } catch (error) {
    console.error('❌ Error testing school persistence:', error.message);
  }
}

// Run the test
testSchoolPersistence();
