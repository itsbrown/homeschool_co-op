import express from 'express';
import { storage } from '../storage';
import { sendNewStudentNotificationEmail } from '../lib/email-service';
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
        username: normalizedData.parentEmail.split('@')[0],
        email: normalizedData.parentEmail,
        password: 'temp_password_' + Math.random().toString(36),
        name: `${parentFirstName || 'Parent'} ${parentLastName || 'User'}`,
        firstName: parentFirstName || 'Parent',
        lastName: parentLastName || 'User',
        phone: normalizedData.parentPhone || null,
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
      schoolId: schoolId || parentUser.schoolId || null,
      locationId: normalizedData.locationId,
      specialNeeds: normalizedData.specialNeeds || null,
      interests: null,
      allergies: allergies || null,
      gender: null,
      school: null,
      learningStyle: null,
      medicalInfo: medicalNotes || null,
      profileImage: null,
      additionalLanguages: null,
      notes: normalizedData.medicalNotes || null,
      emergencyContact: emergencyContactStr || null
    };

    // Check for existing child with same name under this parent to prevent duplicates
    console.log('🔍 Checking for existing child with same name...');
    const existingChildren = await storage.getChildrenByParentId(parentUser.id);
    const existingChild = existingChildren.find(c => 
      c.firstName?.toLowerCase() === normalizedData.childFirstName?.toLowerCase() &&
      c.lastName?.toLowerCase() === normalizedData.childLastName?.toLowerCase()
    );

    let child;
    if (existingChild) {
      console.log('⚠️ Child already exists, updating existing record:', existingChild.id);
      // Update existing child with new data to avoid losing edits
      const updatedChild = await storage.updateChild(existingChild.id, {
        birthdate: normalizedData.childBirthdate || existingChild.birthdate,
        gradeLevel: normalizedData.childGradeLevel || existingChild.gradeLevel,
        schoolId: schoolId || parentUser.schoolId || existingChild.schoolId,
        locationId: normalizedData.locationId || existingChild.locationId,
        specialNeeds: normalizedData.specialNeeds || existingChild.specialNeeds,
        allergies: allergies || existingChild.allergies,
        medicalInfo: medicalNotes || existingChild.medicalInfo,
        notes: normalizedData.medicalNotes || existingChild.notes,
        emergencyContact: emergencyContactStr || existingChild.emergencyContact
      });
      child = updatedChild || existingChild; // Fall back to existing if update returns undefined
      console.log('✅ Updated existing child:', child.id);
    } else {
      child = await storage.createChild(childData);
      console.log('✅ Created child:', child.id);
    }

    // Create school_student record if child has a schoolId
    let studentSchoolId: number | null = null;
    if (child && (schoolId || parentUser.schoolId)) {
      studentSchoolId = schoolId || parentUser.schoolId;
      try {
        console.log('📚 Checking for existing school_student record for child:', child.id, 'at school:', studentSchoolId);
        
        // Check if school_student record already exists to prevent duplicates
        const existingSchoolStudents = await storage.getAllSchoolStudents();
        const existingSchoolStudent = existingSchoolStudents.find(ss => 
          ss.childId === child.id && ss.schoolId === studentSchoolId
        );
        
        if (existingSchoolStudent) {
          console.log('⚠️ School student record already exists:', existingSchoolStudent.id);
        } else {
          const schoolStudent = await storage.createSchoolStudent({
            schoolId: studentSchoolId!,
            childId: child.id,
            grade: normalizedData.childGradeLevel,
            status: 'active',
            locationId: normalizedData.locationId || null,
            studentId: null,
            notes: null
          });
          console.log('✅ School student record created:', schoolStudent);
        }
      } catch (schoolStudentError) {
        console.error('⚠️ Failed to create school_student record:', schoolStudentError);
        // Don't fail the entire registration if this fails - child is already created
      }
    }

    // 🔔 Notify school admins about new student registration
    if (studentSchoolId) {
      try {
        console.log('🔔 Sending notifications to school admins for school:', studentSchoolId);
        
        // Fetch all users and filter for school admins
        const allUsers = await storage.getAllUsers();
        const schoolAdmins = allUsers.filter(user => 
          user.schoolId === studentSchoolId && 
          (user.role === 'schoolAdmin' || user.role === 'superAdmin')
        );
        console.log(`📋 Found ${schoolAdmins.length} school admin(s) to notify`);
        
        // Get school details for better notifications
        const school = await storage.getSchool(studentSchoolId);
        const schoolName = school?.name || 'Your School';
        
        // Only send notifications if we have admins
        if (schoolAdmins.length > 0) {
          // Send email notifications to each admin
          for (const admin of schoolAdmins) {
            try {
              const emailSent = await sendNewStudentNotificationEmail({
                adminEmail: admin.email,
                adminName: admin.name || `${admin.firstName} ${admin.lastName}`,
                schoolName: schoolName,
                studentFirstName: normalizedData.childFirstName,
                studentLastName: normalizedData.childLastName,
                studentGradeLevel: normalizedData.childGradeLevel,
                parentEmail: normalizedData.parentEmail,
                parentPhone: normalizedData.parentPhone,
                registrationDate: new Date()
              });
              
              if (emailSent) {
                console.log(`✅ Sent email notification to admin: ${admin.email}`);
              } else {
                console.log(`⚠️ Email notification failed for admin: ${admin.email}`);
              }
            } catch (notificationError) {
              const error = notificationError as Error;
              console.error(`❌ Failed to notify admin ${admin.email}:`, error.message);
              // Continue notifying other admins even if one fails
            }
          }
        }
        
        console.log('✅ Admin notification process completed');
      } catch (notificationError) {
        const error = notificationError as Error;
        console.error('⚠️ Error during admin notification process:', error.message);
        // Don't fail registration if notifications fail
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
    const err = error as Error;
    console.error('💥 REGISTRATION ERROR:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to register student. Please try again.'
    });
  }
});

export default router;