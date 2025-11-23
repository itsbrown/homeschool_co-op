import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { insertUserSchema, membershipEnrollments } from "@shared/schema";
import { sendWelcomeEmail } from "../lib/email-service";
import { sendPasswordResetEmail } from "../services/emailService";
import { userStorage } from "../users-storage";
import { supabaseAdmin } from "../db/supabase";
import { supabaseAuth } from "../middleware/supabase-auth";
import { getDb } from "../db";

const router = Router();

// Middleware to check Firebase authentication
// Removing Firebase authentication, so this middleware is no longer needed
// Auth0 authentication is handled by middleware

// Middleware to check authentication (wrapper around supabaseAuth)
export const isAuthenticated = supabaseAuth;

// Middleware to check role
export const hasRole = (roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (req.session.userId && roles.includes(req.session.userRole)) {
      return next();
    }
    res.status(403).json({ message: "Forbidden" });
  };
};

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      parentFirstName, 
      parentLastName, 
      firstName, 
      lastName, 
      phone,
      location,
      role,
      schoolId,
      registrationCode
    } = req.body;

    // Handle both old format (firstName/lastName) and new format (parentFirstName/parentLastName)
    const userFirstName = parentFirstName || firstName;
    const userLastName = parentLastName || lastName;

    if (!email || !userFirstName || !userLastName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, first name, and last name are required' 
      });
    }

    // List of reserved test account emails that cannot be registered
    const reservedEmails = [
      'educator.test@americanseekersacademy.com',
      'admin@example.com',
      'educator@example.com',
      'parent@example.com',
      'learner@example.com',
      'school@example.com'
    ];

    // Check if trying to register a reserved test account email
    if (reservedEmails.includes(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'This email is reserved for testing. Please use a different email address.' 
      });
    }

    // Check if user already exists in database
    // CRITICAL: Do not proceed if we can't verify uniqueness
    let existingUser;
    try {
      existingUser = await storage.getUserByEmail?.(email);
      if (existingUser) {
        console.log(`⚠️ Registration blocked: User ${email} already exists in database (ID: ${existingUser.id})`);
        return res.status(400).json({ 
          success: false, 
          message: 'User already exists. Please use the login page to access your account.' 
        });
      }
    } catch (error) {
      // CRITICAL: If we can't check for existing users, we must fail safely
      console.error('❌ Database lookup failed during registration check:', error);
      return res.status(503).json({ 
        success: false, 
        message: 'Unable to verify account uniqueness. Please try again in a moment.' 
      });
    }

    // Also check Supabase auth to catch orphaned accounts
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        
        // Check if auth account already exists
        const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = existingAuthUsers?.users.find(u => u.email === email);
        
        if (existingAuthUser) {
          console.log(`⚠️ Registration blocked: Auth account for ${email} already exists (Supabase ID: ${existingAuthUser.id})`);
          return res.status(400).json({ 
            success: false, 
            message: 'User already exists. Please use the login page to access your account.' 
          });
        }
      }
    } catch (supabaseCheckError) {
      console.error('❌ Supabase user check failed:', supabaseCheckError);
      // Continue if Supabase check fails but database check passed
      console.log('⚠️ Proceeding with registration despite Supabase check failure');
    }

    // For parent registration, generate a temporary password or use a default
    const userPassword = password || 'tempPassword123';
    const hashedPassword = await bcrypt.hash(userPassword, 10);

    // Create user
    const userData = {
      username: email, // Use email as username
      email,
      password: hashedPassword,
      name: `${userFirstName} ${userLastName}`,
      phone: phone || '',
      role: role || 'parent',
      schoolId: schoolId || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create user in Supabase authentication first
    let supabaseUser;
    try {
      console.log('🔧 Starting Supabase account creation for:', email);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      console.log('🔧 Supabase URL:', supabaseUrl ? 'Present' : 'Missing');
      console.log('🔧 Service Key:', supabaseServiceKey ? 'Present' : 'Missing');
      
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase configuration missing');
      }
      
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      
      console.log('🔧 Creating Supabase auth account...');
      
      // 🔐 PHASE 2: Write to app_metadata (admin-only, secure) for new users
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: userPassword,
        email_confirm: true, // Auto-confirm email for registration
        app_metadata: {
          role: role || 'parent',
          school_id: schoolId || null
        },
        user_metadata: {
          name: `${userFirstName} ${userLastName}`
        }
      });
      
      if (authError) {
        console.error('❌ Supabase auth creation failed:', authError);
        throw new Error(`Authentication account creation failed: ${authError.message}`);
      }
      
      supabaseUser = authData.user;
      console.log('✅ Supabase auth account created successfully:', supabaseUser.id);
      
    } catch (supabaseError) {
      console.error('❌ Supabase account creation failed:', supabaseError);
      const errorMessage = supabaseError instanceof Error ? supabaseError.message : 'Unknown error';
      return res.status(500).json({ 
        success: false, 
        message: `Failed to create authentication account: ${errorMessage}` 
      });
    }

    // Create user in local database/storage
    let user;
    try {
      // Add Supabase ID to user data
      const userDataWithSupabase = {
        ...userData,
        supabaseId: supabaseUser.id
      };
      
      user = await storage.createUser(userDataWithSupabase);
      console.log('✅ Local user record created:', user.id);
    } catch (createError) {
      console.error('Local user creation failed:', createError);
      
      // If local storage fails, clean up the Supabase account
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        await supabaseAdmin.auth.admin.deleteUser(supabaseUser.id);
        console.log('🧹 Cleaned up Supabase account after local storage failure');
      } catch (cleanupError) {
        console.error('Failed to cleanup Supabase account:', cleanupError);
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create user account. Please try again.' 
      });
    }

    // If this is a school-specific registration, associate with school
    // CRITICAL: School association MUST succeed for school registrations
    if (schoolId && registrationCode) {
      try {
        console.log(`🏫 Attempting school association for ${email} with school ${schoolId}`);
        
        // Create school-parent association
        const associationResponse = await fetch(`${req.protocol}://${req.get('host')}/api/school-parents/associate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentEmail: email,
            schoolId,
            registrationCode
          })
        });

        if (!associationResponse.ok) {
          const errorData = await associationResponse.json().catch(() => ({}));
          throw new Error(`School association failed: ${errorData.message || associationResponse.statusText}`);
        }

        console.log(`✅ School association successful for ${email}`);
      } catch (associationError) {
        console.error('❌ School association failed - rolling back account creation:', associationError);
        
        // CRITICAL: Clean up both Supabase and database records since this is a school registration
        try {
          // Delete local database record
          await storage.deleteUser(user.id);
          console.log(`🧹 Deleted local user record (ID: ${user.id})`);
          
          // Delete Supabase auth account
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { autoRefreshToken: false, persistSession: false }
          });
          await supabaseAdmin.auth.admin.deleteUser(supabaseUser.id);
          console.log(`🧹 Deleted Supabase auth account (ID: ${supabaseUser.id})`);
        } catch (cleanupError) {
          console.error('❌ Failed to cleanup accounts after association failure:', cleanupError);
        }
        
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to associate account with school. Please contact your school administrator or try again.' 
        });
      }
    }

    console.log(`✅ Registration complete for ${email} (User ID: ${user.id}, Supabase ID: ${supabaseUser.id})`);
    
    // Auto-create membership enrollment for parent users with school association
    if (schoolId && (role === 'parent' || !role)) {
      try {
        console.log(`🎫 Auto-creating membership enrollment for parent ${email} at school ${schoolId}`);
        
        // Get database connection
        const db = await getDb();
        
        // Create pending membership enrollment with basic tier
        const [newMembership] = await db.insert(membershipEnrollments).values({
          schoolId: schoolId,
          parentUserId: user.id,
          status: 'pending_payment',
          membershipTier: 'basic',
          membershipYear: new Date().getFullYear(),
          amount: 0, // Will be set when school configures fee amount
          amountPaid: 0,
          remainingBalance: 0
        }).returning();
        
        console.log(`✅ Membership enrollment auto-created (ID: ${newMembership.id}) for parent ${email}`);
      } catch (membershipError) {
        // Non-blocking - registration succeeds even if membership creation fails
        console.error('⚠️ Failed to auto-create membership enrollment, but registration was successful:', membershipError);
      }
    }
    
    // Send welcome email (non-blocking - registration succeeds even if email fails)
    try {
      console.log('📧 Sending welcome email to:', email);
      
      // Fetch school data if schoolId is provided
      let schoolName: string | undefined;
      
      if (schoolId) {
        try {
          const school = await storage.getSchool(schoolId);
          if (school) {
            schoolName = school.name;
          }
        } catch (schoolError) {
          console.error('⚠️ Failed to fetch school data for welcome email:', schoolError);
        }
      }
      
      await sendWelcomeEmail({
        email: email,
        firstName: userFirstName,
        lastName: userLastName,
        role: role || 'parent',
        schoolName
      });
      console.log('✅ Welcome email sent successfully');
    } catch (emailError) {
      console.error('⚠️ Failed to send welcome email, but registration was successful:', emailError);
    }
    
    res.json({ 
      success: true, 
      message: 'Parent account created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    console.log('Login attempt for user:', req.body.email || req.body.username);
    const { username, email, password } = req.body;
    const loginIdentifier = email || username;

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required" });
    }

    // Handle test account credentials (including educator email)
    const testAccounts: Record<string, any> = {
      'educator.test@americanseekersacademy.com': {
        id: 2,
        name: 'Sarah Johnson',
        username: 'educator_test',
        email: 'educator.test@americanseekersacademy.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
        firstName: 'Sarah',
        lastName: 'Johnson',
        createdAt: new Date()
      },
      'admin': {
        id: 1,
        name: 'Admin User',
        username: 'admin',
        email: 'admin@example.com', 
        role: 'admin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      },
      'educator': {
        id: 2,
        name: 'Test Educator',
        username: 'educator',
        email: 'educator@example.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
        createdAt: new Date()
      },
      'parent': {
        id: 3,
        name: 'Test Parent',
        username: 'parent',
        email: 'parent@example.com',
        role: 'parent',
        avatar: null,
        subscription: 'family',
        createdAt: new Date()
      },
      'learner': {
        id: 4,
        name: 'Test Learner',
        username: 'learner',
        email: 'learner@example.com',
        role: 'learner',
        avatar: null,
        subscription: 'free',
        createdAt: new Date()
      },
      'schooladmin': {
        id: 5,
        name: 'School Administrator',
        username: 'schooladmin',
        email: 'school@example.com',
        role: 'schoolAdmin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      }
    };

    // Check if this is a test account login
    const testAccount = testAccounts[loginIdentifier];
    if (testAccount && password === 'password') {
      console.log(`Test account login successful: ${loginIdentifier}`);

      // Set session data
      req.session.userId = testAccount.id;
      req.session.userRole = testAccount.role;
      // Clear activeRole on new login to prevent state leakage between users
      req.session.activeRole = undefined;

      // Save session
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err);
            reject(err);
          } else {
            console.log('Session saved successfully');
            resolve();
          }
        });
      });

      return res.status(200).json({
        message: `Login successful (${testAccount.role})`,
        user: testAccount
      });
    }

    // Special case for schooladmin login - the case is important! We need exact match
    if (loginIdentifier === 'schooladmin' && password === 'password') {
      console.log('School Admin login attempt successful');

      // Create hardcoded School Admin user
      const schoolAdminUser = {
        id: 5,
        name: 'School Administrator',
        username: 'schooladmin',
        email: 'school@example.com',
        role: 'schoolAdmin', // Must exactly match what's used in schema.ts
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      };

      // Store user data in session
      req.session.userId = schoolAdminUser.id;
      req.session.userRole = schoolAdminUser.role;
      // Clear activeRole on new login to prevent state leakage between users
      req.session.activeRole = undefined;

      // Debug session information
      console.log('Session before save:', {
        sessionID: req.sessionID,
        cookie: req.session.cookie,
        userId: req.session.userId,
        userRole: req.session.userRole
      });

      // Force save the session with proper error handling
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session for school admin:', err);
            reject(err);
          } else {
            console.log('School admin session saved successfully');
            resolve();
          }
        });
      });

      console.log('Session after save:', {
        sessionID: req.sessionID,
        cookie: req.session.cookie,
        userId: req.session.userId,
        userRole: req.session.userRole
      });

      return res.status(200).json({
        message: "School Admin login successful",
        user: schoolAdminUser
      });
    }

    

    // If we reach this point, it means the user either:
    // 1. Provided incorrect credentials for a test account
    // 2. Is trying to use a database account

    // Try database authentication with bcrypt (for test users and users without Supabase)
    const dbUser = await storage.getUserByEmail?.(loginIdentifier) || await storage.getUserByUsername?.(loginIdentifier);
    
    if (dbUser && dbUser.password) {
      console.log(`🔍 Database user found: ${dbUser.email}, ID: ${dbUser.id}, role: ${dbUser.role}`);
      const passwordMatch = await bcrypt.compare(password, dbUser.password);
      
      if (passwordMatch) {
        console.log(`✅ Database authentication successful for: ${dbUser.email}, ID: ${dbUser.id}`);
        
        // Check if user is active
        if (!dbUser.isActive) {
          console.log('⚠️ User account is inactive:', dbUser.email);
          return res.status(403).json({ message: "Account is inactive. Please contact support." });
        }
        
        // Set session data
        console.log(`📝 Setting session - userId: ${dbUser.id}, userRole: ${dbUser.role}`);
        req.session.userId = dbUser.id;
        req.session.userRole = dbUser.role;
        // Clear activeRole on new login to prevent state leakage between users
        req.session.activeRole = undefined;
        
        // Save session
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error('Error saving session:', err);
              reject(err);
            } else {
              console.log('Session saved successfully');
              resolve();
            }
          });
        });
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = dbUser;
        
        return res.status(200).json({
          message: "Login successful",
          user: userWithoutPassword
        });
      } else {
        console.log('❌ Password mismatch for database user');
      }
    }

    console.log(`Database login failed, trying Supabase authentication for: ${loginIdentifier}`);

    // Authenticate via Supabase
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      // Try to sign in with Supabase
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: loginIdentifier,
        password: password
      });

      if (signInError || !signInData.user) {
        console.log('❌ Supabase authentication failed:', signInError?.message);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log(`✅ Supabase authentication successful for: ${signInData.user.email}`);

      // Get user data from local database
      const user = await storage.getUserByEmail?.(signInData.user.email);
      if (!user) {
        console.log('⚠️ User authenticated but not found in local database:', signInData.user.email);
        return res.status(401).json({ message: "User account not properly configured. Please contact support." });
      }

      console.log(`✅ Found user in database: ${user.email}, ID: ${user.id}, Role: ${user.role}`);

      // Set session data
      if (req.session) {
        req.session.userId = user.id;
        req.session.userRole = user.role;
        // Clear activeRole on new login to prevent state leakage between users
        req.session.activeRole = undefined;
      } else {
        console.log('⚠️ No session available - this endpoint may be designed for token-based auth');
      }

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      console.log('✅ Login successful for user:', user.email);
      
      res.status(200).json({ 
        message: "Login successful", 
        user: userWithoutPassword 
      });
    } catch (supabaseError) {
      console.error('❌ Supabase login error:', supabaseError);
      return res.status(500).json({ message: "Authentication service error. Please try again." });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Error during login" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Error during logout" });
    }
    res.status(200).json({ message: "Logout successful" });
  });
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    console.log('Session check in /me endpoint:', req.session);
    console.log('Cookies received:', req.headers.cookie);

    // First check if user is authenticated
    if (!req.session || !req.session.userId) {
      console.log('No session or userId found in session');
      return res.status(401).json({ message: "Unauthorized" });
    }

    // HARD-CODED TEST ACCOUNTS - NO DATABASE NEEDED
    console.log('User ID from session:', req.session.userId);

    // Directly check which test account to return based on session ID
    if (req.session.userId === 1) {
      const adminUser = {
        id: 1,
        name: 'Admin User',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      };
      console.log('Returning admin user profile');
      return res.status(200).json(adminUser);
    } 
    else if (req.session.userId === 2) {
      const educatorUser = {
        id: 2,
        name: 'Sarah Johnson',
        username: 'educator_test',
        email: 'educator.test@americanseekersacademy.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
        firstName: 'Sarah',
        lastName: 'Johnson',
        createdAt: new Date()
      };
      console.log('Returning educator user profile');
      return res.status(200).json(educatorUser);
    }
    else if (req.session.userId === 3) {
      const parentUser = {
        id: 3,
        name: 'Test Parent',
        username: 'parent',
        email: 'parent@example.com',
        role: 'parent',
        avatar: null,
        subscription: 'family',
        createdAt: new Date()
      };
      console.log('Returning parent user profile');
      return res.status(200).json(parentUser);
    }
    else if (req.session.userId === 4) {
      const learnerUser = {
        id: 4,
        name: 'Test Learner',
        username: 'learner',
        email: 'learner@example.com',
        role: 'learner',
        avatar: null,
        subscription: 'free',
        createdAt: new Date()
      };
      console.log('Returning learner user profile');
      return res.status(200).json(learnerUser);
    }
    else if (req.session.userId === 5) {
      const schoolAdminUser = {
        id: 5,
        name: 'School Administrator',
        username: 'schooladmin',
        email: 'school@example.com',
        role: 'schoolAdmin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      };
      console.log('Returning school admin user profile');
      return res.status(200).json(schoolAdminUser);
    }

    // Try using database for real users
    console.log('Trying to fetch user from database, ID:', req.session.userId);
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Error fetching user data" });
  }
});

// Auth0 authentication is handled by middleware

// Check for role invitation
router.post("/check-invitation", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check for active role invitations
    const invitation = await storage.getActiveRoleInvitation(email);

    if (invitation) {
      return res.status(200).json({ 
        invitation: {
          role: invitation.role,
          schoolId: invitation.schoolId,
          token: invitation.token
        }
      });
    }

    return res.status(200).json({ invitation: null });
  } catch (error) {
    console.error("Check invitation error:", error);
    res.status(500).json({ message: "Error checking invitation" });
  }
});

// Accept role invitation
router.post("/accept-invitation", async (req, res) => {
  try {
    const { token, userEmail } = req.body;

    if (!token || !userEmail) {
      return res.status(400).json({ message: "Token and email are required" });
    }

    const invitation = await storage.acceptRoleInvitation(token, userEmail);

    if (!invitation) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    return res.status(200).json({ 
      message: "Invitation accepted successfully",
      role: invitation.role,
      schoolId: invitation.schoolId
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

// Password reset request
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    console.log(`🔑 Password reset requested for: ${email}`);

    // ALWAYS look up user in Supabase to get the UUID
    let supabaseUuid: string | null = null;
    
    try {
      const { data: supabaseUsers, error } = await supabaseAdmin.auth.admin.listUsers();
      if (!error && supabaseUsers?.users) {
        const supabaseUser = supabaseUsers.users.find((u: any) => u.email === email);
        if (supabaseUser) {
          supabaseUuid = supabaseUser.id;
          console.log(`✅ Found Supabase user with UUID: ${supabaseUuid}`);
        }
      }
    } catch (supabaseError) {
      console.error('❌ Supabase user lookup failed:', supabaseError);
    }
    
    // If no Supabase account exists, check storage to see if user exists there
    if (!supabaseUuid) {
      try {
        const localUser = await storage.getUserByEmail(email);
        if (localUser) {
          // User exists in local DB, try to get their Supabase ID
          if (localUser.supabaseId) {
            supabaseUuid = localUser.supabaseId;
            console.log(`✅ Found Supabase UUID from local DB: ${supabaseUuid}`);
          } else {
            console.log(`⚠️ User ${email} exists in local DB but has no Supabase account`);
          }
        }
      } catch (storageError) {
        console.log('💾 Storage lookup also failed');
      }
    }
    
    if (!supabaseUuid) {
      // Don't reveal if the email exists or not for security
      console.log(`⚠️ No Supabase account found for ${email}, returning success without sending email`);
      return res.status(200).json({ 
        message: "If your email is registered, you will receive a password reset link" 
      });
    }

    // Generate a cryptographically secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    console.log(`🔐 Generated secure reset token for ${email}, expires: ${expiresAt.toISOString()}`);

    // Store the reset token in database with Supabase UUID
    await storage.createPasswordResetToken({
      token: resetToken,
      email: email,
      userId: supabaseUuid,
      expiresAt,
      used: false
    });

    console.log(`💾 Reset token stored in database for Supabase UUID: ${supabaseUuid}`);

    // Clean up expired tokens
    await storage.deleteExpiredPasswordResetTokens();

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;

    // Send password reset email via Brevo
    const emailSent = await sendPasswordResetEmail(email, resetUrl);
    
    if (emailSent) {
      console.log(`✅ Password reset email sent to: ${email}`);
    } else {
      console.log(`⚠️ Failed to send password reset email to: ${email}`);
    }

    res.status(200).json({ 
      message: "If your email is registered, you will receive a password reset link"
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    res.status(500).json({ message: "Error processing your request" });
  }
});

// Reset password with token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    console.log(`🔑 Password reset attempt with token: ${token.substring(0, 10)}...`);

    // Check if token exists and is valid in database
    const tokenData = await storage.getPasswordResetTokenByToken(token);
    if (!tokenData || tokenData.used) {
      console.log(`❌ Invalid or used token: ${token.substring(0, 10)}...`);
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      console.log(`❌ Token expired for ${tokenData.email}, expired at: ${tokenData.expiresAt}`);
      return res.status(400).json({ message: "Reset token has expired" });
    }

    console.log(`✅ Valid token found for email: ${tokenData.email}, userId: ${tokenData.userId}`);

    // Hash the new password for local storage
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password in Supabase using the UUID stored in tokenData.userId
    try {
      console.log(`🔐 Updating Supabase password for UUID: ${tokenData.userId}`);
      
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        tokenData.userId,
        { password: newPassword }
      );

      if (error) {
        console.error('❌ Supabase updateUserById error details:', {
          code: error.code,
          message: error.message,
          status: error.status,
          userId: tokenData.userId,
          email: tokenData.email
        });
        return res.status(500).json({ message: "Error updating password in authentication system" });
      }

      console.log(`✅ Supabase password updated successfully for ${tokenData.email} (UUID: ${tokenData.userId})`);
      
      // Update local database password hash for consistency
      try {
        const localUser = await storage.getUserByEmail(tokenData.email);
        if (localUser) {
          await storage.updateUser(localUser.id, { password: hashedPassword });
          console.log(`✅ Local database password updated for user ID: ${localUser.id}`);
        } else {
          console.log(`⚠️ No local user found for ${tokenData.email}, skipping local password update`);
        }
      } catch (localUpdateError) {
        console.error('⚠️ Failed to update local database password (non-critical):', localUpdateError);
      }
      
      // Mark the token as used
      await storage.markPasswordResetTokenAsUsed(token);
      console.log(`✅ Reset token marked as used for ${tokenData.email}`);

      res.status(200).json({ 
        message: "Password reset successfully. You can now log in with your new password." 
      });
    } catch (updateError) {
      console.error("❌ Unexpected error during password update:", updateError);
      res.status(500).json({ message: "Error updating password" });
    }

  } catch (error) {
    console.error("❌ Reset password error:", error);
    res.status(500).json({ message: "Error resetting password" });
  }
});

// Validate reset token
router.get("/validate-reset-token", async (req, res) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ valid: false, message: "Token is required" });
    }

    const tokenData = await storage.getPasswordResetToken(token);
    if (!tokenData) {
      return res.status(400).json({ valid: false, message: "Invalid token" });
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      await storage.markPasswordResetTokenAsUsed(token);
      return res.status(400).json({ valid: false, message: "Token has expired" });
    }

    if (tokenData.used) {
      return res.status(400).json({ valid: false, message: "Token has already been used" });
    }

    res.status(200).json({ 
      valid: true, 
      email: tokenData.email 
    });
  } catch (error) {
    console.error("Validate token error:", error);
    res.status(500).json({ valid: false, message: "Error validating token" });
  }
});

export default router;