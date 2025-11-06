import { Router } from 'express';
import { storage } from '../storage';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
      username: namePart,
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

// POST sync Supabase role with database role
router.post('/users/sync-supabase-role', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log(`🔄 Admin syncing Supabase role for: ${email}`);
    
    // Get user from database
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'User not found in database' });
    }
    
    console.log(`📊 Database role for ${email}: ${user.role}`);
    
    // Get Supabase user
    const { data: supabaseUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing Supabase users:', listError);
      return res.status(500).json({ message: 'Failed to list Supabase users' });
    }
    
    const supabaseUser = supabaseUsers.users.find((u: any) => u.email === email);
    
    if (!supabaseUser) {
      return res.status(404).json({ message: 'User not found in Supabase' });
    }
    
    console.log(`🔍 Current Supabase role for ${email}: ${supabaseUser.user_metadata?.role || 'none'}`);
    
    // Update Supabase user_metadata with database role
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      supabaseUser.id,
      {
        user_metadata: {
          ...supabaseUser.user_metadata,
          role: user.role,
          school_id: user.schoolId
        }
      }
    );
    
    if (updateError) {
      console.error('Error updating Supabase user:', updateError);
      return res.status(500).json({ message: 'Failed to update Supabase user' });
    }
    
    console.log(`✅ Successfully synced Supabase role for ${email}: ${user.role}`);
    
    res.json({
      message: 'Supabase role synced successfully',
      email: email,
      databaseRole: user.role,
      previousSupabaseRole: supabaseUser.user_metadata?.role,
      newSupabaseRole: user.role,
      note: 'User must log out and log back in for changes to take effect'
    });
  } catch (error) {
    console.error('Error syncing Supabase role:', error);
    res.status(500).json({ message: 'Failed to sync Supabase role' });
  }
});

export default router;
