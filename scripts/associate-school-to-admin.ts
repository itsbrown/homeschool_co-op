/**
 * Script to associate American Seekers Academy with the schoolAdmin user
 */
import { schoolStorage } from '../server/school-storage';

async function associateSchoolToSchoolAdmin() {
  try {
    console.log('Associating American Seekers Academy to schoolAdmin user...');
    
    // Get all schools
    const schools = schoolStorage.getSchools();
    
    // Find American Seekers Academy
    const asaSchool = schools.find(school => school.name === 'American Seekers Academy');
    
    if (!asaSchool) {
      console.error('American Seekers Academy not found in the schools database.');
      return;
    }
    
    // Update the school's adminId to the schoolAdmin user ID (5)
    const updatedSchool = schoolStorage.updateSchool(asaSchool.id, { 
      adminId: 5,
      status: 'active',
      isVerified: true
    });
    
    if (updatedSchool) {
      console.log('Successfully associated American Seekers Academy with schoolAdmin user!');
      console.log('Updated school details:', updatedSchool);
    } else {
      console.error('Failed to update American Seekers Academy.');
    }
  } catch (error) {
    console.error('Error associating school to schoolAdmin:', error);
  }
}

// Run the function
associateSchoolToSchoolAdmin();