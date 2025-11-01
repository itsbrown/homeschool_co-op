import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';
import { jwtCheck } from '../middleware/auth0-auth';

const router = Router();

// Get children for the authenticated parent
router.get('/children', jwtCheck, async (req: any, res) => {
  try {
    console.log('👨‍👩‍👧‍👦 Children API called - Headers:', Object.keys(req.headers));

    // Get the authenticated user's email from the auth middleware
    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL',
        debug: 'Please log in to access children data'
      });
    }

    console.log('👨‍👩‍👧‍👦 Parent requesting children for email:', userEmail);

    // Get children by parent email from storage
    console.log('🔍 Attempting to fetch children from storage...');
    
    // Debug: Get all children to see what's in storage
    const allChildren = await storage.getAllChildren();
    console.log('🔍 All children in storage:', allChildren.map(c => ({ 
      id: c.id, 
      firstName: c.firstName, 
      lastName: c.lastName 
    })));
    
    const children = await storage.getChildrenByParentEmail(userEmail);

    console.log(`🔍 Found ${children.length} children for parent ${userEmail}:`, children);

    if (!children || children.length === 0) {
      console.log('ℹ️ No children found for this user.');
      return res.status(200).json([]);
    }

    // Transform children data to ensure consistent format
    const transformedChildren = children.map(child => ({
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      birthdate: child.birthdate,
      gradeLevel: child.gradeLevel,
      gender: child.gender,
      parentId: child.parentId,
      specialNeeds: child.specialNeeds,
      interests: child.interests,
      school: child.school,
      learningStyle: child.learningStyle,
      allergies: child.allergies,
      medicalInfo: child.medicalInfo,
      profileImage: child.profileImage,
      emergencyContact: child.emergencyContact,
      additionalLanguages: child.additionalLanguages,
      notes: child.notes,
      createdAt: child.createdAt,
      updatedAt: child.updatedAt
    }));

    return res.status(200).json(transformedChildren);
  } catch (error) {
    console.error('❌ Error fetching children:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'CHILDREN_FETCH_ERROR',
      debug: 'Failed to fetch children from database'
    });
  }
});

// Register a new child
router.post('/children', jwtCheck, async (req: any, res) => {
  try {
    console.log('👶 Child registration API called');

    // Get the authenticated user's email from the auth middleware
    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    console.log('👶 Parent registering child for email:', userEmail);

    const { 
      firstName, 
      lastName, 
      birthdate, 
      gradeLevel, 
      gender,
      interests, 
      learningStyle, 
      specialNeeds, 
      allergies, 
      medicalInfo,
      school,
      profileImage,
      emergencyContact,
      emergencyPhone,
      parentPhone,
      additionalLanguages,
      notes
    } = req.body;

    console.log('👶 Child registration data:', { firstName, lastName, gradeLevel, userEmail });

    // Validate required fields
    if (!firstName || !lastName || !birthdate || !gradeLevel) {
      console.log('❌ Missing required fields for child registration');
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['firstName', 'lastName', 'birthdate', 'gradeLevel']
      });
    }

    // Find the parent user to get their ID
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      console.log('❌ Parent user not found:', userEmail);
      return res.status(404).json({ 
        message: 'Parent user not found',
        error: 'PARENT_NOT_FOUND'
      });
    }

    // Calculate age from birthdate
    const birthDate = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Validate and get parent's school and location data
    let validSchoolId = null;
    let parentLocationId = null;
    
    if (parent.schoolId) {
      // Verify the school exists in the database
      try {
        const school = await storage.getSchool(parent.schoolId);
        if (school) {
          validSchoolId = parent.schoolId;
          console.log('✅ Validated school exists:', school.name);
          
          // Get the primary location for the parent's school
          const locations = await storage.getLocationsBySchoolId(parent.schoolId);
          if (locations && locations.length > 0) {
            parentLocationId = locations[0].id;
          }
        } else {
          console.log('⚠️ Parent has invalid schoolId, will create child without school assignment');
        }
      } catch (error) {
        console.log('⚠️ Could not validate parent school, child will be created without school assignment:', error);
      }
    }

    console.log('🏠 Parent location inheritance:', {
      parentSchoolId: validSchoolId,
      parentLocationId,
      parentEmail: userEmail
    });

    // Create the new child object with validated school/location
    const newChild = {
      firstName,
      lastName,
      birthdate,
      gradeLevel,
      gender: gender || null,
      interests: interests || null,
      learningStyle: learningStyle || null,
      specialNeeds: specialNeeds || null,
      allergies: allergies || null,
      medicalInfo: medicalInfo || null,
      school: school || null,
      schoolId: validSchoolId, // Only set if school exists in database
      locationId: parentLocationId, // Only set if school exists and has locations
      profileImage: profileImage || null,
      emergencyContact: emergencyContact || null,
      additionalLanguages: additionalLanguages || null,
      notes: notes || null,
      parentId: parent.id,
      parentEmail: userEmail
    };

    console.log('👶 Creating child in storage:', newChild);

    // Save to storage (this will handle both file and database storage)
    const savedChild = await storage.createChild(newChild);

    console.log('✅ Child registered successfully:', savedChild);

    // Create school_student record if child has a valid schoolId
    if (savedChild.schoolId && validSchoolId) {
      try {
        console.log('📚 Creating school_student record for child:', savedChild.id);
        const schoolStudent = await storage.createSchoolStudent({
          schoolId: validSchoolId,
          childId: savedChild.id,
          grade: gradeLevel,
          status: 'active',
          locationId: parentLocationId || null,
          studentId: null,
          notes: null
        });
        console.log('✅ School student record created:', schoolStudent);
      } catch (schoolStudentError) {
        console.error('⚠️ Failed to create school_student record:', schoolStudentError);
        // Don't fail the entire registration if this fails - child is already created
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Child registered successfully',
      child: savedChild
    });

  } catch (error) {
    console.error('❌ Error registering child:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'CHILD_REGISTRATION_ERROR',
      debug: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;