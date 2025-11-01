import express from 'express';
import { storage } from '../storage';
const router = express.Router();

// Student registration endpoint
router.post('/register', async (req, res) => {
  try {
    console.log('🚀 Student registration started');
    console.log('📝 Request body:', req.body);

    // Support both public registration and school admin formats
    const {
      schoolId,
      schoolRegistrationCode,
      // Public registration format
      parentFirstName,
      parentLastName,
      parentEmail,
      parentPhone,
      childFirstName,
      childLastName,
      childBirthdate,
      childGradeLevel,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,
      medicalNotes,
      specialNeeds,
      allergies,
      agreesToEmails,
      // School admin format
      firstName,
      lastName,
      dateOfBirth,
      gradeLevel,
      locationId,
      sendInvitation,
      emergencyContact,
      emergencyPhone
    } = req.body;

    // Determine which format is being used and normalize
    const isSchoolAdminFormat = !!firstName && !!lastName && !!dateOfBirth;
    
    const normalizedData = {
      parentEmail: parentEmail,
      parentPhone: parentPhone,
      childFirstName: isSchoolAdminFormat ? firstName : childFirstName,
      childLastName: isSchoolAdminFormat ? lastName : childLastName,
      childBirthdate: isSchoolAdminFormat ? dateOfBirth : childBirthdate,
      childGradeLevel: isSchoolAdminFormat ? gradeLevel : childGradeLevel,
      locationId: locationId || null,
      emergencyContactName: isSchoolAdminFormat ? emergencyContact : emergencyContactName,
      emergencyContactPhone: isSchoolAdminFormat ? emergencyPhone : emergencyContactPhone,
      medicalNotes: medicalNotes || '',
      specialNeeds: specialNeeds || '',
      sendInvitation: sendInvitation || false
    };

    console.log('✅ Normalized registration data:', normalizedData);

    // Validate required fields
    if (!normalizedData.parentEmail || !normalizedData.childFirstName || !normalizedData.childLastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: parent email, child first name, and child last name are required'
      });
    }

    // Look for existing parent by email
    console.log('🔍 Looking for parent with email:', normalizedData.parentEmail);
    const existingParent = await storage.getUserByEmail(normalizedData.parentEmail);

    let parentUser;
    if (existingParent && existingParent.role === 'parent') {
      parentUser = existingParent;
      console.log('✅ Found existing parent:', parentUser.id);
    } else {
      // Create new parent user
      const parentData = {
        email: normalizedData.parentEmail,
        firstName: parentFirstName || 'Parent',
        lastName: parentLastName || 'User',
        phone: normalizedData.parentPhone,
        role: 'parent' as const,
        isActive: true
      };

      parentUser = await storage.createUser(parentData);
      console.log('✅ Created new parent user:', parentUser.id);
    }

    // Create child record
    const emergencyContactStr = normalizedData.emergencyContactName && normalizedData.emergencyContactPhone
      ? `${normalizedData.emergencyContactName}: ${normalizedData.emergencyContactPhone}${emergencyContactRelation ? ` (${emergencyContactRelation})` : ''}`
      : normalizedData.emergencyContactName || '';
      
    const childData = {
      firstName: normalizedData.childFirstName,
      lastName: normalizedData.childLastName,
      birthdate: normalizedData.childBirthdate,
      gradeLevel: normalizedData.childGradeLevel,
      parentId: parentUser.id,
      parentEmail: normalizedData.parentEmail,
      locationId: normalizedData.locationId,
      specialNeeds: normalizedData.specialNeeds,
      interests: null,
      notes: normalizedData.medicalNotes,
      emergencyContact: emergencyContactStr
    };

    const child = await storage.createChild(childData);
    console.log('✅ Created child:', child.id);

    // Create school_student record if child has a schoolId
    if (child && (schoolId || parentUser.schoolId)) {
      const studentSchoolId = schoolId || parentUser.schoolId;
      try {
        console.log('📚 Creating school_student record for child:', child.id, 'at school:', studentSchoolId);
        const schoolStudent = await storage.createSchoolStudent({
          schoolId: studentSchoolId,
          childId: child.id,
          grade: normalizedData.childGradeLevel,
          status: 'active',
          locationId: normalizedData.locationId || null,
          studentId: null,
          notes: null
        });
        console.log('✅ School student record created:', schoolStudent);
      } catch (schoolStudentError) {
        console.error('⚠️ Failed to create school_student record:', schoolStudentError);
        // Don't fail the entire registration if this fails - child is already created
      }
    }

    // Send confirmation email (if email service is available)
    try {
      // Mock email sending
      console.log(`📧 [MOCK EMAIL] Registration confirmation sent to: ${normalizedData.parentEmail}`);
      console.log(`📧 Child: ${normalizedData.childFirstName} ${normalizedData.childLastName} registered successfully`);
    } catch (emailError) {
      console.log('📧 Email sending failed, but continuing:', emailError);
    }

    res.json({
      success: true,
      message: 'Student registered successfully',
      parentId: parentUser.id,
      childId: child.id,
      child: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        gradeLevel: child.gradeLevel,
        locationId: child.locationId,
        parentEmail: normalizedData.parentEmail
      }
    });

  } catch (error) {
    console.error('💥 REGISTRATION ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to register student. Please try again.'
    });
  }
});

export default router;