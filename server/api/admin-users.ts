import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// GET user by email (check if user exists)
router.get('/users/email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    
    console.log(`🔍 Admin checking user existence: ${email}`);
    
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return res.status(404).json({ 
        exists: false,
        message: 'User not found',
        email: email
      });
    }
    
    console.log(`✅ User found: ${email} - Role: ${user.role}, ID: ${user.id}`);
    
    res.json({
      exists: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error checking user existence:', error);
    res.status(500).json({ message: 'Failed to check user existence' });
  }
});

// POST create missing user (for parents with enrollments but no user record)
router.post('/users/create-from-enrollments', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log(`🔧 Admin creating user from enrollments: ${email}`);
    
    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists',
        user: existingUser
      });
    }
    
    // Get enrollments for this email to determine school
    const allEnrollments = await storage.getAllEnrollments();
    const userEnrollments = allEnrollments.filter((e: any) => 
      e.parentEmail === email
    );
    
    if (userEnrollments.length === 0) {
      return res.status(404).json({ 
        message: 'No enrollments found for this email. Cannot determine school.'
      });
    }
    
    // Get school ID from first enrollment
    const schoolId = userEnrollments[0].schoolId || 1; // Default to American Seekers Academy
    
    console.log(`📚 Found ${userEnrollments.length} enrollments for ${email}, schoolId: ${schoolId}`);
    
    // Extract name from email (before @)
    const namePart = email.split('@')[0];
    const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    
    // Create user record
    const newUser = await storage.createUser({
      email: email,
      name: name,
      role: 'parent',
      schoolId: schoolId,
      password: '', // No password needed for Supabase OAuth users
      subscription: 'free'
    });
    
    console.log(`✅ Created user: ${email} - ID: ${newUser.id}, Role: ${newUser.role}, School: ${schoolId}`);
    
    res.json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        schoolId: newUser.schoolId
      },
      enrollmentsFound: userEnrollments.length
    });
  } catch (error) {
    console.error('Error creating user from enrollments:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

export default router;
