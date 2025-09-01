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
      lastName: c.lastName, 
      parentEmail: c.parentEmail || c.parent_email 
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
      firstName: child.firstName || child.first_name,
      lastName: child.lastName || child.last_name,
      birthdate: child.birthdate,
      gradeLevel: child.gradeLevel || child.grade_level,
      gender: child.gender,
      parentId: child.parentId || child.parent_id,
      parentEmail: child.parentEmail || child.parent_email || userEmail,
      specialNeeds: child.specialNeeds || child.special_needs,
      interests: child.interests,
      school: child.school,
      learningStyle: child.learningStyle || child.learning_style,
      allergies: child.allergies,
      medicalInfo: child.medicalInfo || child.medical_info,
      profileImage: child.profileImage || child.profile_image,
      emergencyContact: child.emergencyContact,
      additionalLanguages: child.additionalLanguages,
      notes: child.notes,
      createdAt: child.createdAt || child.created_at,
      updatedAt: child.updatedAt || child.updated_at
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
      parentPhone
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

    // Calculate age from birthdate
    const birthDate = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Create the new child object
    const newChild = {
      firstName,
      lastName,
      birthdate,
      gradeLevel,
      gender: gender || null,
      parentEmail: userEmail,
      parent_email: userEmail, // Ensure both field names are set for compatibility
      parentPhone: parentPhone || null,
      interests: interests || null,
      learningStyle: learningStyle || null,
      specialNeeds: specialNeeds || null,
      allergies: allergies || null,
      medicalInfo: medicalInfo || null,
      school: school || null,
      profileImage: profileImage || null,
      emergencyContact: emergencyContact || null,
      emergencyPhone: emergencyPhone || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('👶 Creating child in storage:', newChild);

    // Save to storage (this will handle both file and database storage)
    const savedChild = await storage.createChild(newChild);

    console.log('✅ Child registered successfully:', savedChild);

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
      debug: error.message
    });
  }
});

export default router;