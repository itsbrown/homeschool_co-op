const express = require('express');
const router = express.Router();

// Mock storage object (replace with your actual storage implementation)
const storage = {
  getUserByEmail: async (email) => {
    // Mock implementation: returns null for demonstration purposes
    return null;
  },
  createUser: async (userData) => {
    // Mock implementation: returns user data with a generated ID
    return { id: Date.now(), ...userData };
  },
  createChild: async (childData) => {
    // Mock implementation: returns child data with a generated ID
    return { id: Date.now(), ...childData };
  }
};

// Student registration endpoint
router.post('/register', async (req, res) => {
  try {
    console.log('🚀 Student registration started');
    console.log('📝 Request body:', req.body);

    const {
      schoolId,
      schoolRegistrationCode,
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
      agreesToEmails
    } = req.body;

    // Validate required fields
    if (!schoolRegistrationCode || !parentEmail || !childFirstName || !childLastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: school registration code, parent email, child first name, and child last name are required'
      });
    }

    // Extract form data for processing
    const formData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      dateOfBirth: req.body.dateOfBirth,
      gradeLevel: req.body.gradeLevel,
      parentEmail: req.body.parentEmail,
      sendInvitation: req.body.sendInvitation
    };

    console.log('✅ Extracted form data:', formData);

    // Look for existing parent by email with fallback handling
    console.log('🔍 Looking for parent with email:', parentEmail);
    let existingParent;
    try {
      existingParent = await storage.getUserByEmail(parentEmail);
    } catch (dbError) {
      console.log('⚠️ Database failed, using file storage fallback:', dbError.message);
      // Use file storage directly for user lookup
      const fs = require('fs');
      const path = require('path');
      const usersFilePath = path.join(process.cwd(), 'data', 'users.json');

      if (fs.existsSync(usersFilePath)) {
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        existingParent = usersData.find(user => user.email === parentEmail && user.role === 'parent');
      }
    }

    let parentUser;
    if (existingParent && existingParent.role === 'parent') {
      parentUser = existingParent;
      console.log('✅ Found existing parent:', parentUser.id);
    } else {
      // Create new parent user with fallback handling
      const parentData = {
        id: Date.now(), // Generate ID for file storage
        email: parentEmail,
        firstName: parentFirstName,
        lastName: parentLastName,
        phone: parentPhone,
        role: 'parent' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      try {
        parentUser = await storage.createUser(parentData);
        console.log('✅ Created new parent user via storage:', parentUser.id);
      } catch (dbError) {
        console.log('⚠️ Database failed, using file storage fallback for user creation');
        // Use file storage directly
        const fs = require('fs');
        const path = require('path');
        const usersFilePath = path.join(process.cwd(), 'data', 'users.json');

        let usersData = [];
        if (fs.existsSync(usersFilePath)) {
          usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }

        usersData.push(parentData);
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        parentUser = parentData;
        console.log('✅ Created new parent user via file storage:', parentUser.id);
      }
    }

    // Create child record with fallback handling
    const childData = {
      id: Date.now() + 1, // Generate unique ID
      firstName: childFirstName,
      lastName: childLastName,
      birthdate: childBirthdate,
      gradeLevel: childGradeLevel,
      parentId: parentUser.id,
      parentEmail: parentEmail,
      specialNeeds: specialNeeds || '',
      interests: null,
      notes: medicalNotes || '',
      emergencyContact: `${emergencyContactName}: ${emergencyContactPhone} (${emergencyContactRelation})`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    let child;
    try {
      child = await storage.createChild(childData);
      console.log('✅ Created child via storage:', child.id);
    } catch (dbError) {
      console.log('⚠️ Database failed, using file storage fallback for child creation');
      // Use file storage directly
      const fs = require('fs');
      const path = require('path');
      const childrenFilePath = path.join(process.cwd(), 'data', 'children.json');

      let childrenData = [];
      if (fs.existsSync(childrenFilePath)) {
        childrenData = JSON.parse(fs.readFileSync(childrenFilePath, 'utf8'));
      }

      childrenData.push(childData);
      fs.writeFileSync(childrenFilePath, JSON.stringify(childrenData, null, 2));
      child = childData;
      console.log('✅ Created child via file storage:', child.id);
    }

    // Send confirmation email (if email service is available)
    try {
      // Mock email sending
      console.log(`📧 [MOCK EMAIL] Registration confirmation sent to: ${parentEmail}`);
      console.log(`📧 Child: ${childFirstName} ${childLastName} registered successfully`);
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
        parentEmail: parentEmail
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

module.exports = router;