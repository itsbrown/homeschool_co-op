import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';

const router = Router();

// Get children for the authenticated parent
router.get('/children', async (req, res) => {
  try {
    console.log('👨‍👩‍👧‍👦 Children API called - Headers:', Object.keys(req.headers));

    // Get the authenticated user's email from the token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid authorization header found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_AUTH_HEADER',
        debug: 'Please log in to access children data'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔑 Token received, length:', token.length);

    // Decode the Supabase JWT to get user email
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      console.log('👨‍👩‍👧‍👦 Parent requesting children for email:', userEmail);
    } catch (error) {
      console.error('❌ Error decoding token:', error);
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'TOKEN_DECODE_ERROR',
        debug: 'Token could not be decoded'
      });
    }

    if (!userEmail) {
      console.log('❌ No email found in token payload');
      return res.status(401).json({ 
        message: 'Email not found in token',
        error: 'NO_EMAIL_IN_TOKEN',
        debug: 'Token does not contain email information'
      });
    }

    // Get children by parent email from storage
    console.log('🔍 Attempting to fetch children from storage...');
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
      parentId: child.parentId || child.parent_id,
      parentEmail: child.parentEmail || child.parent_email || userEmail,
      specialNeeds: child.specialNeeds || child.special_needs,
      interests: child.interests,
      school: child.school,
      learningStyle: child.learningStyle || child.learning_style,
      allergies: child.allergies,
      medicalInfo: child.medicalInfo || child.medical_info,
      profileImage: child.profileImage || child.profile_image,
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
router.post('/children', async (req, res) => {
  try {
    console.log('👶 Child registration API called');

    // Get the authenticated user's email from the token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid authorization header found for child registration');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_AUTH_HEADER'
      });
    }

    const token = authHeader.split(' ')[1];

    // Decode the Supabase JWT to get user email
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
      console.log('👶 Parent registering child for email:', userEmail);
    } catch (error) {
      console.error('❌ Error decoding token for child registration:', error);
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'TOKEN_DECODE_ERROR'
      });
    }

    if (!userEmail) {
      console.log('❌ No email found in token for child registration');
      return res.status(401).json({ 
        message: 'Email not found in token',
        error: 'NO_EMAIL_IN_TOKEN'
      });
    }

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