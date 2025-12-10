import { Router } from 'express';
import { storage } from '../storage';
import { createClient } from '@supabase/supabase-js';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';

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
    
    // Generate a temporary password for the new account
    const temporaryPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    
    // Create Supabase auth account first
    let supabaseUserId: string;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: {
          role: 'parent',
          school_id: schoolId
        },
        user_metadata: {
          name: name
        }
      });

      // If account already exists, find it and link it
      if (authError && (authError.code === 'email_exists' || authError.message?.includes('already registered'))) {
        console.log(`⚠️ Supabase account already exists for ${email}, finding existing account...`);
        
        // Use paginated lookup to find user by email
        let existingSupabaseUser = null;
        let page = 1;
        const perPage = 1000;
        let listError = null;
        
        while (!existingSupabaseUser && page <= 100) {
          const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage
          });
          
          if (getUserError) {
            console.error('❌ Failed to list Supabase users:', getUserError);
            listError = getUserError;
            break;
          }
          
          existingSupabaseUser = userData?.users?.find((u: any) => u.email === email);
          
          if (!existingSupabaseUser && (!userData?.users || userData.users.length < perPage)) {
            break; // No more users
          }
          page++;
        }
        
        if (listError) {
          return res.status(500).json({ message: 'Failed to find existing authentication account' });
        }
        
        if (!existingSupabaseUser) {
          console.error('❌ Supabase user not found despite email exists error for:', email);
          return res.status(500).json({ message: 'Could not find existing authentication account. Please try again.' });
        }
        
        supabaseUserId = existingSupabaseUser.id;
        console.log(`✅ Found existing Supabase account with UUID: ${supabaseUserId}`);
        
        // Update the existing Supabase account's password
        await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, { 
          password: temporaryPassword 
        });
        console.log(`✅ Updated password for existing Supabase account ${supabaseUserId}`);
      } else if (authError) {
        console.error('❌ Supabase account creation failed:', authError);
        return res.status(500).json({ message: `Failed to create authentication account: ${authError.message}` });
      } else {
        supabaseUserId = authData.user.id;
        console.log(`✅ Supabase account created with UUID: ${supabaseUserId}`);
      }
    } catch (supabaseError) {
      console.error('❌ Error creating Supabase account:', supabaseError);
      return res.status(500).json({ message: 'Failed to create authentication account' });
    }
    
    // Create user record in local database with Supabase ID
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    
    const newUser = await storage.createUser({
      email: email,
      name: name,
      username: namePart,
      role: 'parent',
      schoolId: schoolId,
      password: hashedPassword,
      supabaseId: supabaseUserId,
      subscription: 'free'
    });
    
    console.log(`✅ Created user: ${email} - ID: ${newUser.id}, Role: ${newUser.role}, School: ${schoolId}, Supabase UUID: ${supabaseUserId}`);
    
    res.json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        schoolId: newUser.schoolId,
        supabaseId: supabaseUserId
      },
      enrollmentsFound: userEnrollments.length,
      temporaryPassword: temporaryPassword
    });
  } catch (error) {
    console.error('Error creating user from enrollments:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// POST update user role in database and sync with Supabase
router.post('/users/update-role', async (req, res) => {
  try {
    const { email, role } = req.body;
    
    if (!email || !role) {
      return res.status(400).json({ message: 'Email and role are required' });
    }
    
    console.log(`🔧 Admin updating role for ${email} to: ${role}`);
    
    // Get user from database
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'User not found in database' });
    }
    
    console.log(`📊 Current database role for ${email}: ${user.role}`);
    
    // Update user role in database
    const updatedUser = await storage.updateUser(user.id, { role });
    
    if (!updatedUser) {
      return res.status(500).json({ message: 'Failed to update user role in database' });
    }
    
    console.log(`✅ Updated database role for ${email}: ${role}`);
    
    // Now sync with Supabase - use paginated lookup to find user by email
    let supabaseUser = null;
    let page = 1;
    const perPage = 1000;
    
    while (!supabaseUser && page <= 100) {
      const { data: userData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (listError) {
        console.error('Error finding Supabase user:', listError);
        return res.json({
          message: 'Database role updated, but failed to sync with Supabase',
          email: email,
          databaseRole: role,
          supabaseSync: 'failed'
        });
      }
      
      supabaseUser = userData?.users?.find((u: any) => u.email === email);
      
      if (!supabaseUser && (!userData?.users || userData.users.length < perPage)) {
        break; // No more users
      }
      page++;
    }
    
    if (!supabaseUser) {
      return res.json({
        message: 'Database role updated, but user not found in Supabase',
        email: email,
        databaseRole: role,
        supabaseSync: 'user_not_found'
      });
    }
    
    console.log(`🔍 Current Supabase role for ${email}: ${supabaseUser.user_metadata?.role || 'none'}`);
    
    // Update Supabase user_metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      supabaseUser.id,
      {
        user_metadata: {
          ...supabaseUser.user_metadata,
          role: role,
          school_id: user.schoolId
        }
      }
    );
    
    if (updateError) {
      console.error('Error updating Supabase user:', updateError);
      return res.json({
        message: 'Database role updated, but failed to update Supabase metadata',
        email: email,
        databaseRole: role,
        supabaseSync: 'failed'
      });
    }
    
    console.log(`✅ Successfully synced Supabase role for ${email}: ${role}`);
    
    res.json({
      message: 'User role updated successfully in both database and Supabase',
      email: email,
      previousRole: user.role,
      newRole: role,
      note: 'User must log out and log back in for changes to take effect'
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
});

// POST create Supabase accounts for users missing them (migration utility)
router.post('/users/migrate-to-supabase', async (req, res) => {
  try {
    console.log('🔄 Starting migration: creating Supabase accounts for users without supabaseId');
    
    // Get all users from database
    const allUsers = await storage.getAllUsers?.() || [];
    
    // Filter users without supabaseId
    const usersWithoutSupabase = allUsers.filter((user: any) => !user.supabaseId);
    
    console.log(`📊 Found ${usersWithoutSupabase.length} users without Supabase accounts out of ${allUsers.length} total users`);
    
    const results = {
      total: usersWithoutSupabase.length,
      successful: 0,
      failed: 0,
      errors: [] as any[]
    };
    
    for (const user of usersWithoutSupabase) {
      try {
        console.log(`🔧 Creating Supabase account for: ${user.email}`);
        
        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
        
        // Create Supabase account
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: tempPassword,
          email_confirm: true,
          app_metadata: {
            role: user.role || 'parent',
            school_id: user.schoolId || null
          },
          user_metadata: {
            name: `${user.firstName || user.name || ''} ${user.lastName || ''}`
          }
        });

        let supabaseUserId: string;

        // If account already exists, find it and link it
        if (authError && (authError.code === 'email_exists' || authError.message?.includes('already registered'))) {
          console.log(`⚠️ Supabase account already exists for ${user.email}, finding and linking...`);
          
          // Use paginated lookup to find user by email
          let existingSupabaseUser = null;
          let findPage = 1;
          const findPerPage = 1000;
          
          while (!existingSupabaseUser && findPage <= 100) {
            const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.listUsers({
              page: findPage,
              perPage: findPerPage
            });
            
            if (getUserError) {
              console.error(`❌ Failed to list Supabase users for ${user.email}:`, getUserError);
              break;
            }
            
            existingSupabaseUser = userData?.users?.find((u: any) => u.email === user.email);
            
            if (!existingSupabaseUser && (!userData?.users || userData.users.length < findPerPage)) {
              break; // No more users
            }
            findPage++;
          }
          
          if (!existingSupabaseUser) {
            console.error(`❌ Supabase user not found for ${user.email} despite email exists error`);
            results.failed++;
            results.errors.push({ email: user.email, error: 'Account not found. Please try again.' });
            continue;
          }
          
          supabaseUserId = existingSupabaseUser.id;
          console.log(`✅ Found existing Supabase account for ${user.email} with UUID: ${supabaseUserId}`);
          
          // Update the existing Supabase account's password
          await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, { 
            password: tempPassword 
          });
          console.log(`✅ Updated password for existing Supabase account ${supabaseUserId}`);
        } else if (authError) {
          console.error(`❌ Failed to create Supabase account for ${user.email}:`, authError);
          results.failed++;
          results.errors.push({ email: user.email, error: authError.message });
          continue;
        } else {
          supabaseUserId = authData.user.id;
          console.log(`✅ Created Supabase account for ${user.email} with UUID: ${supabaseUserId}`);
        }

        // Update local user with supabaseId
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        await storage.updateUser(user.id, { 
          supabaseId: supabaseUserId,
          password: hashedPassword 
        });
        
        console.log(`✅ Linked local user ${user.id} to Supabase UUID: ${supabaseUserId}`);
        results.successful++;
      } catch (error: any) {
        console.error(`❌ Error processing user ${user.email}:`, error);
        results.failed++;
        results.errors.push({ email: user.email, error: error.message });
      }
    }
    
    console.log(`✅ Migration complete: ${results.successful} successful, ${results.failed} failed`);
    
    res.json({
      message: 'Migration completed',
      results: results
    });
  } catch (error) {
    console.error('Error during migration:', error);
    res.status(500).json({ message: 'Migration failed' });
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
    
    // Get Supabase user - use paginated lookup to find user by email
    let supabaseUser = null;
    let syncPage = 1;
    const syncPerPage = 1000;
    
    while (!supabaseUser && syncPage <= 100) {
      const { data: userData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: syncPage,
        perPage: syncPerPage
      });
      
      if (listError) {
        console.error('Error finding Supabase user:', listError);
        return res.status(500).json({ message: 'Failed to find Supabase user' });
      }
      
      supabaseUser = userData?.users?.find((u: any) => u.email === email);
      
      if (!supabaseUser && (!userData?.users || userData.users.length < syncPerPage)) {
        break; // No more users
      }
      syncPage++;
    }
    
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

// GET export all users and children data as CSV
router.get('/export/users-and-children', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const userRole = req.user?.role || req.user?.activeRole;
    const userEmail = req.user?.email;
    
    // Only school admins can export user data
    if (userRole !== 'schoolAdmin' && userRole !== 'admin' && userRole !== 'superAdmin') {
      console.log(`❌ Export denied - insufficient permissions. User: ${userEmail}, Role: ${userRole}`);
      return res.status(403).json({ message: 'Only school administrators can export user data' });
    }
    
    console.log(`📊 Exporting users and children for school ${schoolId} by ${userEmail}`);
    
    // Get all users for this school
    const allUsers = await storage.getAllUsers();
    const schoolUsers = allUsers.filter((u: any) => u.schoolId === schoolId);
    
    console.log(`👥 Found ${schoolUsers.length} users for school ${schoolId}`);
    
    // Build export data - one row per child, with parent info repeated
    const exportRows: any[] = [];
    
    for (const user of schoolUsers) {
      // Get children for this user
      const children = await storage.getChildrenByParentId(user.id);
      
      if (children.length === 0) {
        // User with no children - still include them
        exportRows.push({
          // Parent/User info
          userId: user.id,
          memberId: user.memberId || '',
          userEmail: user.email,
          userName: user.name,
          userFirstName: user.firstName || '',
          userLastName: user.lastName || '',
          userPhone: user.phone || '',
          userRole: user.role,
          emergencyContactFirstName: user.emergencyContactFirstName || '',
          emergencyContactLastName: user.emergencyContactLastName || '',
          emergencyContactPhone: user.emergencyContactPhone || '',
          emergencyContactRelationship: user.emergencyContactRelationship || '',
          userCreatedAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
          // Child info - empty for users without children
          childId: '',
          childFirstName: '',
          childLastName: '',
          childBirthdate: '',
          childGradeLevel: '',
          childGender: '',
          childSchool: '',
          childLearningStyle: '',
          childSpecialNeeds: '',
          childInterests: '',
          childAllergies: '',
          childMedicalInfo: '',
          childEmergencyContact: '',
          childAdditionalLanguages: '',
          childNotes: '',
          childCreatedAt: '',
        });
      } else {
        // User with children - one row per child
        for (const child of children) {
          exportRows.push({
            // Parent/User info
            userId: user.id,
            memberId: user.memberId || '',
            userEmail: user.email,
            userName: user.name,
            userFirstName: user.firstName || '',
            userLastName: user.lastName || '',
            userPhone: user.phone || '',
            userRole: user.role,
            emergencyContactFirstName: user.emergencyContactFirstName || '',
            emergencyContactLastName: user.emergencyContactLastName || '',
            emergencyContactPhone: user.emergencyContactPhone || '',
            emergencyContactRelationship: user.emergencyContactRelationship || '',
            userCreatedAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
            // Child info
            childId: child.id,
            childFirstName: child.firstName,
            childLastName: child.lastName,
            childBirthdate: child.birthdate || '',
            childGradeLevel: child.gradeLevel || '',
            childGender: child.gender || '',
            childSchool: child.school || '',
            childLearningStyle: child.learningStyle || '',
            childSpecialNeeds: child.specialNeeds || '',
            childInterests: Array.isArray(child.interests) ? child.interests.join('; ') : (child.interests || ''),
            childAllergies: child.allergies || '',
            childMedicalInfo: child.medicalInfo || '',
            childEmergencyContact: child.emergencyContact || '',
            childAdditionalLanguages: child.additionalLanguages || '',
            childNotes: child.notes || '',
            childCreatedAt: child.createdAt ? new Date(child.createdAt).toISOString() : '',
          });
        }
      }
    }
    
    console.log(`📝 Generated ${exportRows.length} export rows`);
    
    // Generate CSV
    const headers = [
      'User ID', 'Member ID', 'User Email', 'User Name', 'First Name', 'Last Name', 'Phone', 'Role',
      'Emergency Contact First Name', 'Emergency Contact Last Name', 'Emergency Contact Phone', 'Emergency Contact Relationship',
      'User Created At',
      'Child ID', 'Child First Name', 'Child Last Name', 'Child Birthdate', 'Child Grade Level',
      'Child Gender', 'Child School', 'Child Learning Style', 'Child Special Needs', 'Child Interests',
      'Child Allergies', 'Child Medical Info', 'Child Emergency Contact', 'Child Additional Languages', 'Child Notes', 'Child Created At'
    ];
    
    // Helper to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    // Build CSV content
    let csvContent = headers.map(h => escapeCSV(h)).join(',') + '\n';
    
    for (const row of exportRows) {
      const values = [
        row.userId, row.memberId, row.userEmail, row.userName, row.userFirstName, row.userLastName,
        row.userPhone, row.userRole, row.emergencyContactFirstName, row.emergencyContactLastName,
        row.emergencyContactPhone, row.emergencyContactRelationship, row.userCreatedAt,
        row.childId, row.childFirstName, row.childLastName, row.childBirthdate, row.childGradeLevel,
        row.childGender, row.childSchool, row.childLearningStyle, row.childSpecialNeeds, row.childInterests,
        row.childAllergies, row.childMedicalInfo, row.childEmergencyContact, row.childAdditionalLanguages,
        row.childNotes, row.childCreatedAt
      ];
      csvContent += values.map(v => escapeCSV(v)).join(',') + '\n';
    }
    
    // Set headers for file download
    const filename = `users_and_children_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    console.log(`✅ Export complete: ${filename}`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting users and children:', error);
    res.status(500).json({ message: 'Failed to export data' });
  }
});

export default router;
