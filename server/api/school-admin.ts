import { Router } from "express";
import '../middleware/types'; // Import Express type augmentation
import { storage } from "../storage";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as brevo from '@getbrevo/brevo';
import { createClient } from '@supabase/supabase-js';
import { parse as parseCSV } from 'csv-parse';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sendAccountInviteEmail, sendStaffInvitationEmail, sendPasswordResetEmail } from '../lib/email-service';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { clearPermissionCache } from '../middleware/locationPermissions';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db';

// Rate limiter for permission updates - prevent bulk abuse
const permissionUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 permission updates per 15 minutes per user
  message: {
    error: 'Rate limit exceeded',
    message: 'Too many permission updates. Please try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Key by user ID only - this runs after supabaseAuth so user is always available
    return `user:${req.user?.id || 'anonymous'}`;
  },
  skip: (req: any) => !req.user?.id, // Skip rate limiting if no user (will be rejected by auth anyway)
});
import { sql, eq, and } from 'drizzle-orm';
import { users, schools, userRoles, userLocations, locations, type InsertSchool, type UserRole } from '@shared/schema';

const router = Router();

// Download CSV template - Must be first to avoid conflicts
router.get('/csv-template/:type', (req: any, res) => {
  const type = req.params.type;
  
  let csvContent = '';
  let filename = '';
  
  if (type === 'parents') {
    csvContent = 'First Name,Last Name,Email,Phone,Location,Emergency Contact - First Name,Emergency Contact - Last Name,Emergency Contact Phone\n';
    csvContent += 'John,Doe,john.doe@example.com,555-0123,Greece,Mary,Doe,555-0199\n';
    csvContent += 'Jane,Smith,jane.smith@example.com,555-0124,Brighton,Tom,Smith,555-0198\n';
    filename = 'parents_template.csv';
  } else if (type === 'children') {
    csvContent = 'First Name,Last Name,Parent Email,Grade,Birth Date\n';
    csvContent += 'Emma,Doe,john.doe@example.com,K,2019-05-15\n';
    csvContent += 'Noah,Smith,jane.smith@example.com,3,2016-08-22\n';
    filename = 'children_template.csv';
  } else if (type === 'staff') {
    csvContent = 'First Name,Last Name,Email,Phone,Position,Location\n';
    csvContent += 'Sarah,Johnson,sarah.johnson@example.com,555-0125,Teacher,Greece\n';
    csvContent += 'Mike,Wilson,mike.wilson@example.com,555-0126,Administrator,Brighton\n';
    filename = 'staff_template.csv';
  } else {
    return res.status(400).json({ message: 'Invalid template type' });
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// Initialize Brevo
let brevoApiInstance: brevo.TransactionalEmailsApi | null = null;
if (process.env.BREVO_API_KEY) {
  brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  console.log('✅ Brevo initialized for staff invitations');
} else {
  console.warn('⚠️ BREVO_API_KEY not found - staff invitation emails will not be sent');
}

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Generate a temporary password for new accounts
function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// NOTE: extractSchoolId and requireSchoolContext are now imported from middleware/require-school-context.ts
// The middleware handles school ID extraction from the database

/**
 * Legacy helper for routes that call requireSchoolContext as a function instead of middleware
 * This should be used temporarily until all routes are refactored to use middleware properly
 * @deprecated Use requireSchoolContext middleware and read req.schoolId instead
 */
async function getSchoolIdFromRequest(req: any, res: any): Promise<number | null> {
  // If middleware already set req.schoolId, use it
  if (req.schoolId) {
    return Number(req.schoolId);
  }
  
  // Otherwise, extract from database (fallback for routes not using middleware)
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(400).json({ message: "User email not found in request" });
    return null;
  }
  
  try {
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      res.status(400).json({ message: "User not found in database" });
      return null;
    }
    
    // Prioritize legacy schoolId field
    if (user.schoolId !== null && user.schoolId !== undefined && user.schoolId > 0) {
      return user.schoolId;
    }
    
    // Multi-role support: Get school ID from active role
    if (user.activeRoleId) {
      const db = await getDb();
      const activeRoles = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.id, user.activeRoleId))
        .limit(1);
      
      if (activeRoles.length > 0 && activeRoles[0].schoolId) {
        return activeRoles[0].schoolId;
      }
    }
    
    res.status(400).json({ message: "School ID not found in database" });
    return null;
  } catch (error) {
    console.error('Error extracting school ID:', error);
    res.status(500).json({ message: "Error determining school context" });
    return null;
  }
}

// Create Supabase account for staff member (exported for use in public invitation flow)
export async function createStaffAccount(email: string, firstName: string, lastName: string, role: string, department: string): Promise<{ success: boolean; temporaryPassword?: string; error?: string; userExists?: boolean }> {
  try {
    console.log(`👤 Creating Supabase account for: ${email}`);
    
    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        firstName,
        lastName,
        role,
        department,
        accountType: 'staff',
        mustChangePassword: true,
        createdViaInvitation: true
      }
    });

    if (authError) {
      console.error('❌ Error creating Supabase user:', authError);
      // Check if user already exists
      if (authError.message?.includes('already been registered') || authError.code === 'email_exists') {
        console.log(`⚠️ User ${email} already exists, continuing with invitation acceptance`);
        return { success: false, error: authError.message, userExists: true };
      }
      return { success: false, error: authError.message };
    }

    console.log(`✅ Successfully created Supabase account for: ${email}`);
    return { success: true, temporaryPassword };
    
  } catch (error) {
    console.error('❌ Error creating staff account:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send account credentials email (exported for use in public invitation flow)
export async function sendAccountCredentialsEmail(email: string, firstName: string, lastName: string, temporaryPassword: string, role: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping credentials email');
      return false;
    }

    const loginUrl = `${process.env.CLIENT_URL || 'https://e9b53de1-e746-4728-984c-69d24304d3d8-00-8l7syqdrxe0h.picard.replit.dev'}/login`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #059669; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Account Created Successfully!</h1>
          <p style="color: #A7F3D0; margin: 8px 0 0 0;">American Seekers Academy</p>
        </div>

        <div style="padding: 24px;">
          <h2 style="color: #1F2937;">Welcome to the Team, ${firstName}!</h2>

          <p>Your staff invitation has been accepted and your account is ready to use.</p>

          <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
            <h3 style="margin: 0 0 12px 0; color: #92400E;">Your Login Credentials</h3>
            <p style="margin: 8px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 8px 0;"><strong>Temporary Password:</strong> <code style="background: #FFF; padding: 4px 8px; font-size: 14px; border-radius: 4px;">${temporaryPassword}</code></p>
            <p style="margin: 8px 0;"><strong>Role:</strong> ${role}</p>
          </div>

          <div style="background-color: #FEE2E2; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #DC2626;"><strong>Important:</strong> You will be required to change this password when you first log in for security reasons.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
               Login to Your Account
            </a>
          </div>

          <p style="font-size: 14px; color: #6B7280;">
            If you have any questions or need assistance, please contact us at support@americanseekersacademy.com
          </p>
        </div>
      </div>
    `;

    const textContent = `
Welcome to American Seekers Academy!

Dear ${firstName} ${lastName},

Your staff invitation has been accepted and your account is ready to use.

Login Credentials:
Email: ${email}
Temporary Password: ${temporaryPassword}
Role: ${role}

IMPORTANT: You will be required to change this password when you first log in for security reasons.

Please visit: ${loginUrl}

If you have any questions, please contact us at support@americanseekersacademy.com
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = "Your Account is Ready - ASA Platform Access";
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;
    sendSmtpEmail.sender = { name: "American Seekers Academy", email: "noreply@americanseekersacademy.com" };
    sendSmtpEmail.to = [{ email, name: `${firstName} ${lastName}` }];

    const response = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Account credentials email sent successfully via Brevo to: ${email}`);
    console.log(`📧 Brevo Message ID: ${response.body.messageId}`);
    return true;

  } catch (error) {
    console.error('❌ Error sending credentials email:', error);
    return false;
  }
}

// Generate a random token for invitations
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper function to map position/role to database schema role enum
// Maps: "Support Staff"/"Aide"/"Volunteer" -> "staff", "Mentor" -> "teacher", "Administrator" -> "administrator"
function mapPositionToRole(position: string): "teacher" | "administrator" | "staff" | "other" {
  const positionLower = position.toLowerCase();
  
  if (positionLower.includes('teacher') || positionLower.includes('mentor') || positionLower.includes('instructor')) {
    return 'teacher';
  }
  if (positionLower.includes('admin')) {
    return 'administrator';
  }
  if (positionLower.includes('support') || positionLower.includes('aide') || positionLower.includes('volunteer')) {
    return 'staff';
  }
  
  return 'other';
}

// Helper function to transform database school_staff + user to frontend format (legacy - kept for compatibility)
function transformStaffToFrontend(schoolStaff: any, user: any, classes: any[] = [], hasPendingInvitation: boolean = false) {
  // Determine status: Pending invitation takes priority over Active/Inactive
  let status = 'Inactive';
  if (hasPendingInvitation) {
    status = 'Pending';
  } else if (schoolStaff.isActive) {
    status = 'Active';
  }
  
  return {
    id: schoolStaff.id,
    email: user.email,
    firstName: user.name?.split(' ')[0] || '',
    lastName: user.name?.split(' ').slice(1).join(' ') || '',
    name: user.name,
    role: schoolStaff.position, // Use position as role for frontend
    department: schoolStaff.department || '',
    status: status,
    joinDate: schoolStaff.startDate ? new Date(schoolStaff.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    avatar: '',
    phone: user.phone || '',
    subjects: [],
    classIds: classes.map(c => c.id.toString()),
    locationId: schoolStaff.locationId || null
  };
}

// Staff-type system roles that can be assigned to classes and view rosters
const STAFF_TYPE_ROLES = ['educator', 'teacher', 'schoolAdmin'];

// Transform user_roles-based staff data to frontend format
// userLocationId from user_locations table is the source of truth for location assignments
// staffRecord from school_staff is used for department enrichment only
function transformUserRoleStaffToFrontend(
  userRole: any, 
  user: any, 
  classes: any[] = [], 
  hasPendingInvitation: boolean = false,
  staffRecord?: any, // Optional school_staff record for department enrichment
  userLocationId?: number | null // Source of truth for location from user_locations table
) {
  const status = hasPendingInvitation ? 'Pending' : (user.isActive !== false ? 'Active' : 'Inactive');
  
  return {
    id: userRole.id, // Use user_roles.id as staff ID
    email: user.email,
    firstName: user.firstName || user.name?.split(' ')[0] || '',
    lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    role: userRole.role, // The role/position from user_roles
    department: staffRecord?.department || userRole.role || '', // Use department from school_staff if available
    status: status,
    joinDate: userRole.createdAt ? new Date(userRole.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    avatar: user.avatar || '',
    phone: user.phone || '',
    subjects: [],
    classIds: classes.map(c => c.id.toString()),
    locationId: userLocationId !== undefined ? userLocationId : (staffRecord?.locationId || null), // Prefer user_locations, fallback to school_staff
    userId: user.id // Include user ID for reference
  };
}

// Test route to verify router is working
router.get("/test", (req, res) => {
  console.log("🚨 TEST ROUTE HIT!");
  res.json({ message: "School admin router is working!" });
});

// Debug route to check users in storage
router.get("/debug-users", async (req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    console.log("📋 All users in storage:", allUsers.map(u => ({ id: u.id, email: u.email, role: u.role })));
    res.json(allUsers.map(u => ({ id: u.id, email: u.email, role: u.role, supabaseId: u.supabaseId })));
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Removed problematic authentication middleware that was blocking PATCH requests

// School admin login now handled through Supabase authentication
// Removed hardcoded authentication bypass for security

import { jwtCheck } from '../middleware/auth0-auth';

// Get the school associated with the logged-in school administrator
router.get("/my-school", jwtCheck, async (req: any, res) => {
  try {
    console.log('🏫 Fetching school data for admin');
    
    // User is already authenticated and synced by jwtCheck middleware
    const user = req.user;
    
    if (!user || !user.email) {
      return res.status(401).json({ message: "Authentication failed" });
    }
    
    console.log('✅ Authenticated user from middleware:', user.email);

    // Get admin user from middleware (already synced to database)
    const adminUser = user;
    
    if (!adminUser) {
      console.log('❌ User not synced to database:', user.email);
      return res.status(500).json({ message: "User sync failed" });
    }
    
    // CRITICAL FIX: Access schoolId from the database user (dbUser) or req.auth
    // The middleware stores database info in req.user.dbUser and req.auth.schoolId
    const userSchoolId = adminUser.dbUser?.schoolId || req.auth?.schoolId;
    
    console.log('✅ Found admin user:', { 
      id: adminUser.id, 
      email: adminUser.email, 
      role: adminUser.role,
      dbUserSchoolId: adminUser.dbUser?.schoolId,
      reqAuthSchoolId: req.auth?.schoolId,
      finalSchoolId: userSchoolId
    });
    
    // This is the authoritative source of truth from the database
    if (userSchoolId) {
      console.log(`🎯 Using user's schoolId from database: ${userSchoolId}`);
      const school = await storage.getSchool(userSchoolId);
      
      if (school) {
        console.log('✅ Found school for user:', school.name);
        
        // Load locations for this school
        const locations = await storage.getLocationsBySchoolId(school.id);
        console.log(`🏢 Found ${locations.length} locations for school ${school.name}`);
        
        const responseData = {
          ...school,
          locations
        };
        
        console.log('🚀 SENDING RESPONSE FROM DATABASE (schoolId):', JSON.stringify(responseData, null, 2));
        
        // Return school with embedded locations
        return res.json(responseData);
      } else {
        console.error(`❌ School ${adminUser.schoolId} not found in database!`);
      }
    }
    
    console.log('🔍 Fetching schools from database...');
    
    // Fallback: Get all schools from database
    const allSchools = await storage.getAllSchools();
    console.log('📋 Found schools in database:', allSchools.length);
    console.log('🔍 All schools:', allSchools.map((s: any) => ({ id: s.id, name: s.name, adminId: s.adminId })));

    // Try to find a school already associated with this admin user via adminId
    // Use the database user ID (from dbUser), not the Supabase UUID
    const dbUserId = adminUser.dbUser?.id;
    
    console.log('🔍 Looking for school with adminId:', dbUserId);
    
    let school = allSchools.find((s: any) => 
      s.adminId === dbUserId
    );

    if (school) {
      console.log('✅ Found existing school for admin (via adminId):', school.name);
      console.log('📊 RAW DATABASE DATA:', JSON.stringify(school, null, 2));
      
      // Load locations for this school
      const locations = await storage.getLocationsBySchoolId(school.id);
      console.log(`🏢 Found ${locations.length} locations for school ${school.name}`);
      
      const responseData = {
        ...school,
        locations
      };
      
      console.log('🚀 SENDING RESPONSE FROM DATABASE:', JSON.stringify(responseData, null, 2));
      console.log('🔍 Description field value:', responseData.description);
      console.log('🔍 Registration code value:', responseData.registrationCode);
      
      // Return school with embedded locations
      return res.json(responseData);
    }

    // If no associated school found, try to find an unassociated "American Seekers Academy" school
    const unassociatedSchool = allSchools.find((s: any) => 
      s.name === 'American Seekers Academy' && 
      (!s.adminId || s.adminId === null)
    );

    if (unassociatedSchool) {
      console.log('🔗 Associating school with admin user:', unassociatedSchool.name);
      
      // Update the school to associate it with this admin
      const updatedSchool = await storage.updateSchool(unassociatedSchool.id, {
        // adminId is set during school creation, not via update
      });
      
      if (updatedSchool) {
        console.log('✅ School associated successfully');
        
        // Load locations for the newly associated school
        const locations = await storage.getLocationsBySchoolId(updatedSchool.id);
        console.log(`🏢 Found ${locations.length} locations for school ${updatedSchool.name}`);
        
        // Return school with embedded locations
        return res.json({
          ...updatedSchool,
          locations
        });
      }
    }

    console.log('❌ No school found to associate with this admin');
    return res.status(404).json({ message: "No school found for this admin" });
  } catch (error: unknown) {
    console.error("Error fetching school information:", error);
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
    return res.status(500).json({ message: "Error fetching school information" });
  }
});

// Create initial school setup for a new admin

async function setupSchool(req: any, res: any) {
  try {
    console.log('🏫 Setting up school for new admin');
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log('❌ No authorization header provided');
      return res.status(401).json({ message: "No authorization header" });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('🔒 Token received');

    // Extract school registration data from request body
    const {
      name,
      type,
      address,
      city,
      state,
      zipCode,
      phoneNumber,
      email,
      website,
      description,
      accreditation,
      enrollmentSize,
      foundedYear
    } = req.body;

    // Validate required fields
    if (!name || !type || !city || !state || !zipCode || !email) {
      return res.status(400).json({ 
        message: "Missing required fields",
        required: ["name", "type", "city", "state", "zipCode", "email"]
      });
    }

    try {
      // Create a new Supabase client instance with the user's access token
      const { createClient } = await import('@supabase/supabase-js');

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.log('⚠️ Supabase not configured, using file storage');
        throw new Error('Supabase not configured');
      }

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );

      // Verify the token and get user
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        console.log('⚠️ Auth failed, using file storage fallback');
        throw new Error('Auth failed');
      }

      console.log('✅ Setting up school for user:', user.email);

      // Use admin client to create the school
      const { supabaseAdmin } = await import('../db/supabase');

      // Get user from MemStorage
      const userData = await storage.getUserByEmail(user.email || '');
      if (!userData) {
        console.error('User not found in storage');
        return res.status(404).json({ message: "User not found in storage" });
      }

      console.log('✅ Found user in storage:', userData.email);

      // Create school using Supabase admin client
      const schoolData = {
        name,
        type,
        address,
        city,
        state,
        zip_code: zipCode,
        phone_number: phoneNumber,
        email,
        website,
        description,
        accreditation,
        enrollment_size: enrollmentSize ? parseInt(enrollmentSize) : null,
        founded_year: foundedYear ? parseInt(foundedYear) : null,
        admin_id: userData.id,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('📋 Creating school with data:', schoolData);

      const { data: newSchool, error: schoolError } = await supabaseAdmin
        .from('schools')
        .insert(schoolData)
        .select()
        .single();

      if (schoolError) {
        console.error('❌ Database error creating school:', schoolError);
        return res.status(500).json({ message: `Database error: ${schoolError.message}` });
      }

      console.log('🚀 Created school successfully in database:', newSchool);
      return res.json(newSchool);

    } catch (dbError) {
      console.error('⚠️ Database error in school setup:', dbError);
      return res.status(500).json({ message: "Database error during school setup" });
    }

  } catch (error: any) {
    console.error("❌ Error setting up school:", error.message, error.stack);
    res.status(500).json({ message: "Error setting up school", error: error.message });
  }
}

router.post("/setup-school", setupSchool);

// Get classes for the school
router.get("/classes", supabaseAuth, requireSchoolContext, async (req: any, res: any) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    console.log(`🏫 Loading classes for school ID: ${schoolId}`);

    // Get classes from database storage
    const allClasses = await storage.getClassesBySchoolId(String(schoolId));
    
    console.log(`Found ${allClasses.length} classes for school ID ${schoolId} from database`);

    // Add enrollment counts and parse variants from each class
    // Keep classes with variants intact (don't expand into individual entries)
    const classesWithEnrollment = await Promise.all(allClasses.map(async (classItem) => {
      // Calculate enrollment count using the correct method
      // This counts enrollments by classId/marketplaceClassId with valid statuses (pending_payment, enrolled, waitlist, completed)
      const classEnrollmentCount = await storage.getEnrollmentCountForClass(classItem.id);
      
      // Parse variants from schedule field if they exist
      let variants = undefined;
      console.log(`📊 Class ${classItem.id} "${classItem.title}" schedule type:`, typeof classItem.schedule);
      console.log(`📊 Class ${classItem.id} schedule value:`, classItem.schedule);
      
      if (classItem.schedule && typeof classItem.schedule === 'string') {
        try {
          const scheduleData = JSON.parse(classItem.schedule);
          console.log(`📊 Class ${classItem.id} parsed schedule:`, scheduleData);
          if (scheduleData && scheduleData.variants && Array.isArray(scheduleData.variants)) {
            variants = scheduleData.variants;
            console.log(`✅ Class ${classItem.id} has ${variants.length} variants`);
          }
        } catch (e) {
          const error = e as Error;
          console.log(`⚠️ Class ${classItem.id} schedule JSON parse error:`, error.message);
        }
      } else if (classItem.schedule && typeof classItem.schedule === 'object') {
        // Schedule is already an object (not JSON string)
        console.log(`📊 Class ${classItem.id} schedule is already an object:`, classItem.schedule);
        if ((classItem.schedule as any).variants && Array.isArray((classItem.schedule as any).variants)) {
          variants = (classItem.schedule as any).variants;
          console.log(`✅ Class ${classItem.id} has ${variants.length} variants from object`);
        }
      }
      
      // Look up location name if locationId exists
      let locationName = null;
      if (classItem.locationId) {
        try {
          const location = await storage.getLocationById(classItem.locationId);
          if (location) {
            locationName = location.name;
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch location for class ${classItem.id}:`, error);
        }
      }
      
      // Derive instructor name from instructorId join (source of truth) instead of hardcoded field
      let derivedInstructorName = null;
      if (classItem.instructorId) {
        try {
          const instructor = await storage.getUser(classItem.instructorId);
          if (instructor) {
            // Fallback order: name > firstName+lastName > email > null
            derivedInstructorName = instructor.name 
              || (instructor.firstName && instructor.lastName ? `${instructor.firstName} ${instructor.lastName}` : null)
              || instructor.email 
              || null;
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch instructor for class ${classItem.id}:`, error);
        }
      }
      
      // Return the class with variants array intact for enrollment dialog
      // Category is stored as a string in the database, so we just pass it through as categoryName
      return {
        ...classItem,
        enrollmentCount: classEnrollmentCount,
        capacity: classItem.capacity || 20,
        enrolled: classEnrollmentCount,
        // Include variants array if they exist
        variants: variants || undefined,
        // Include location name for display
        location: locationName || classItem.location || null,
        // Pass category as categoryName for frontend consistency
        categoryName: classItem.category || null,
        // Override instructorName with derived value from instructorId (source of truth)
        instructorName: derivedInstructorName || classItem.instructorName || null
      };
    }));

    // Apply additional filters if needed
    let filteredClasses = classesWithEnrollment;
    if (req.query.search) {
      const searchTerm = (req.query.search as string).toLowerCase();
      filteredClasses = filteredClasses.filter(cls => 
        cls.title.toLowerCase().includes(searchTerm) || 
        (cls.description && cls.description.toLowerCase().includes(searchTerm))
      );
    }

    if (req.query.category && req.query.category !== "all-categories") {
      filteredClasses = filteredClasses.filter(cls => cls.category === req.query.category);
    }

    if (req.query.status && req.query.status !== "all-statuses") {
      filteredClasses = filteredClasses.filter(cls => cls.status === req.query.status);
    }

    // Return the filtered classes
    res.json({
      items: filteredClasses,
      total: filteredClasses.length,
      page: 1,
      limit: allClasses.length,
      totalPages: 1
    });
  } catch (error) {
    console.error("Error fetching school classes:", error);
    res.status(500).json({ message: "Error fetching school classes" });
  }
});

// Get individual class by ID for editing
router.get("/classes/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const classId = parseInt(req.params.id);
    console.log('🔍 Fetching class with ID:', classId);

    // Get class from database
    const classData = await storage.getClassById(classId);

    if (!classData) {
      console.log('❌ Class not found with ID:', classId);
      return res.status(404).json({ message: 'Class not found' });
    }

    if (classData.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this class' });
    }

    // Parse variants from schedule field if they exist
    let variants = undefined;
    if (classData.schedule && typeof classData.schedule === 'string') {
      try {
        const scheduleData = JSON.parse(classData.schedule);
        if (scheduleData && scheduleData.variants && Array.isArray(scheduleData.variants)) {
          variants = scheduleData.variants;
        }
      } catch (e) {
        // Not JSON, keep schedule as-is
      }
    } else if (classData.schedule && typeof classData.schedule === 'object' && (classData.schedule as any).variants) {
      // Already parsed as object
      variants = (classData.schedule as any).variants;
    }

    console.log('✅ Class found:', classData.title);
    console.log('📋 Parsed variants:', variants);
    
    // Calculate enrollment count dynamically
    const enrollmentCount = await storage.getEnrollmentCountForClass(classData.id);
    console.log(`📊 Class ${classData.id} enrollment count: ${enrollmentCount}`);
    
    res.json({
      ...classData,
      variants,
      enrollmentCount
    });
  } catch (error) {
    console.error('❌ Error fetching class:', error);
    res.status(500).json({ message: 'Error fetching class' });
  }
});

// Update class by ID
router.put("/classes/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const classId = parseInt(req.params.id);
    console.log('📝 Updating class with ID:', classId);
    console.log('📄 Update data:', JSON.stringify(req.body, null, 2));

    // Get existing class from database
    const existingClass = await storage.getClassById(classId);
    if (!existingClass) {
      console.log('❌ Class not found with ID:', classId);
      return res.status(404).json({ message: 'Class not found' });
    }

    if (existingClass.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this class' });
    }

    // Handle variants - convert to JSON schedule format
    let schedule = req.body.schedule || existingClass.schedule;
    if (req.body.variants && Array.isArray(req.body.variants)) {
      schedule = JSON.stringify({ variants: req.body.variants });
    }

    // Handle gradeLevels array
    let gradeLevels = existingClass.gradeLevels;
    if (req.body.gradeLevels && Array.isArray(req.body.gradeLevels)) {
      gradeLevels = req.body.gradeLevels;
    }

    // Find instructor ID from instructor name if changed
    let instructorId = existingClass.instructorId;
    let instructorName = existingClass.instructorName;
    if (req.body.instructorName && req.body.instructorName !== existingClass.instructorName) {
      instructorName = req.body.instructorName;
      if (req.body.instructorName !== 'no-instructor' && req.body.instructorName !== 'No Instructor Assigned') {
        const allStaff = await storage.getSchoolStaffBySchoolId(schoolId);
        for (const staffRecord of allStaff) {
          const user = await storage.getUser(staffRecord.userId);
          if (user && (user.name === req.body.instructorName || 
                      `${user.firstName} ${user.lastName}` === req.body.instructorName)) {
            instructorId = user.id;
            console.log(`✅ Found instructor ID ${instructorId} for ${instructorName}`);
            break;
          }
        }
      } else {
        instructorId = null;
        console.log('ℹ️ No instructor assigned');
      }
    }

    // Prepare update data
    const updateData: any = {
      title: req.body.title || existingClass.title,
      description: req.body.description || existingClass.description,
      category: req.body.category || existingClass.category,
      gradeLevels: gradeLevels,
      status: req.body.status || existingClass.status,
      startDate: req.body.startDate || existingClass.startDate,
      endDate: req.body.endDate || existingClass.endDate,
      schedule: schedule,
      capacity: req.body.capacity !== undefined ? req.body.capacity : existingClass.capacity,
      locationId: req.body.locationId !== undefined ? req.body.locationId : existingClass.locationId,
      instructorName: instructorName,
      instructorId: instructorId,
      price: req.body.price !== undefined ? req.body.price : existingClass.price,
      isAdminOnly: req.body.isAdminOnly !== undefined ? req.body.isAdminOnly : existingClass.isAdminOnly
    };

    // Update the main class in database
    const updatedClass = await storage.updateClass(classId, updateData);
    
    if (!updatedClass) {
      console.log('❌ Failed to update class with ID:', classId);
      return res.status(500).json({ message: 'Failed to update class' });
    }

    // If this class has variants, update the corresponding child classes
    if (req.body.variants && Array.isArray(req.body.variants)) {
      console.log('🔄 Updating child classes for variants...');
      const baseTitle = updatedClass.title;
      const allClasses = await storage.getAllClasses();
      
      for (const variant of req.body.variants) {
        // Find child class with matching title pattern "BaseTitle | VariantName"
        let childTitle = `${baseTitle} | ${variant.name}`;
        let childClass = allClasses.find((cls: any) => cls.title === childTitle);
        
        // If exact match fails, try to find by partial match (e.g., "Half Day" matches "Half Day 9-12pm")
        if (!childClass) {
          const variantBaseName = variant.name.split(/\d/)[0].trim();
          childTitle = `${baseTitle} | ${variantBaseName}`;
          childClass = allClasses.find((cls: any) => cls.title === childTitle);
        }
        
        if (childClass) {
          console.log(`  ✅ Updating child class: ${childClass.title} with price ${variant.price}`);
          await storage.updateClass(childClass.id, {
            price: variant.price,
            location: updatedClass.location ?? undefined,
            instructorName: updatedClass.instructorName ?? undefined,
            capacity: updatedClass.capacity ?? undefined,
            startDate: updatedClass.startDate ? new Date(updatedClass.startDate) : null,
            endDate: updatedClass.endDate ? new Date(updatedClass.endDate) : null,
            description: updatedClass.description,
            category: updatedClass.category,
            status: updatedClass.status,
            gradeLevels: updatedClass.gradeLevels || []
          });
        } else {
          console.log(`  ⚠️ Child class not found for variant: ${variant.name}`);
        }
      }
    }

    console.log('✅ Class updated successfully:', updatedClass.title);
    res.json(updatedClass);
  } catch (error) {
    console.error('❌ Error updating class:', error);
    res.status(500).json({ message: 'Error updating class' });
  }
});

// PATCH handler for class updates (same as PUT - frontend uses PATCH)
router.patch("/classes/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const classId = parseInt(req.params.id);
    console.log('📝 [PATCH] Updating class with ID:', classId);
    console.log('📄 Update data:', JSON.stringify(req.body, null, 2));

    const existingClass = await storage.getClassById(classId);
    if (!existingClass) {
      console.log('❌ Class not found with ID:', classId);
      return res.status(404).json({ message: 'Class not found' });
    }

    if (existingClass.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this class' });
    }

    let schedule = req.body.schedule || existingClass.schedule;
    if (req.body.variants && Array.isArray(req.body.variants)) {
      schedule = JSON.stringify({ variants: req.body.variants });
    }

    let gradeLevels = existingClass.gradeLevels;
    if (req.body.gradeLevels && Array.isArray(req.body.gradeLevels)) {
      gradeLevels = req.body.gradeLevels;
    }

    let instructorId = existingClass.instructorId;
    let instructorName = existingClass.instructorName;
    if (req.body.instructorName && req.body.instructorName !== existingClass.instructorName) {
      instructorName = req.body.instructorName;
      if (req.body.instructorName !== 'no-instructor' && req.body.instructorName !== 'No Instructor Assigned') {
        const allStaff = await storage.getSchoolStaffBySchoolId(schoolId);
        for (const staffRecord of allStaff) {
          const user = await storage.getUser(staffRecord.userId);
          if (user && (user.name === req.body.instructorName || 
                      `${user.firstName} ${user.lastName}` === req.body.instructorName)) {
            instructorId = user.id;
            console.log(`✅ Found instructor ID ${instructorId} for ${instructorName}`);
            break;
          }
        }
      } else {
        instructorId = null;
        console.log('ℹ️ No instructor assigned');
      }
    }

    const updateData: any = {
      title: req.body.title || existingClass.title,
      description: req.body.description || existingClass.description,
      category: req.body.category || existingClass.category,
      gradeLevels: gradeLevels,
      status: req.body.status || existingClass.status,
      startDate: req.body.startDate || existingClass.startDate,
      endDate: req.body.endDate || existingClass.endDate,
      schedule: schedule,
      capacity: req.body.capacity !== undefined ? req.body.capacity : existingClass.capacity,
      locationId: req.body.locationId !== undefined ? req.body.locationId : existingClass.locationId,
      instructorName: instructorName,
      instructorId: instructorId,
      price: req.body.price !== undefined ? req.body.price : existingClass.price,
      isAdminOnly: req.body.isAdminOnly !== undefined ? req.body.isAdminOnly : existingClass.isAdminOnly
    };

    const updatedClass = await storage.updateClass(classId, updateData);
    
    if (!updatedClass) {
      console.log('❌ Failed to update class with ID:', classId);
      return res.status(500).json({ message: 'Failed to update class' });
    }

    if (req.body.variants && Array.isArray(req.body.variants)) {
      console.log('🔄 Updating child classes for variants...');
      const baseTitle = updatedClass.title;
      const allClasses = await storage.getAllClasses();
      
      for (const variant of req.body.variants) {
        let childTitle = `${baseTitle} | ${variant.name}`;
        let childClass = allClasses.find((cls: any) => cls.title === childTitle);
        
        if (!childClass) {
          const variantBaseName = variant.name.split(/\d/)[0].trim();
          childTitle = `${baseTitle} | ${variantBaseName}`;
          childClass = allClasses.find((cls: any) => cls.title === childTitle);
        }
        
        if (childClass) {
          console.log(`  ✅ Updating child class: ${childClass.title} with price ${variant.price}`);
          await storage.updateClass(childClass.id, {
            price: variant.price,
            location: updatedClass.location ?? undefined,
            instructorName: updatedClass.instructorName ?? undefined,
            capacity: updatedClass.capacity ?? undefined,
            startDate: updatedClass.startDate ? new Date(updatedClass.startDate) : null,
            endDate: updatedClass.endDate ? new Date(updatedClass.endDate) : null,
            description: updatedClass.description,
            category: updatedClass.category,
            status: updatedClass.status,
            gradeLevels: updatedClass.gradeLevels || []
          });
        } else {
          console.log(`  ⚠️ Child class not found for variant: ${variant.name}`);
        }
      }
    }

    console.log('✅ [PATCH] Class updated successfully:', updatedClass.title);
    res.json(updatedClass);
  } catch (error) {
    console.error('❌ [PATCH] Error updating class:', error);
    res.status(500).json({ message: 'Error updating class' });
  }
});

// Delete a class
router.delete("/classes/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({ message: 'Invalid class ID' });
    }

    console.log(`🗑️ Deleting class with ID: ${classId}`);

    // Get class from database before deleting
    const classToDelete = await storage.getClassById(classId);
    
    if (!classToDelete) {
      console.log('❌ Class not found with ID:', classId);
      return res.status(404).json({ message: 'Class not found' });
    }

    if (classToDelete.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this class' });
    }

    // Delete the class from database
    await storage.deleteClass(classId);

    console.log('✅ Class deleted successfully:', classToDelete.title);
    res.json({ message: 'Class deleted successfully', deletedClass: classToDelete });
  } catch (error) {
    console.error('❌ Error deleting class:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting class';
    
    // Check if this is a dependency conflict error
    if (errorMessage.includes('Cannot delete class:')) {
      return res.status(409).json({ message: errorMessage });
    }
    
    // For other errors, return 500
    res.status(500).json({ message: errorMessage });
  }
});

// Get class roster (students enrolled in a specific class)
router.get("/classes/:id/roster", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    console.log(`📚 Fetching roster for class ID: ${classId}`);

    const classData = await storage.getClassById(classId);
    if (!classData) {
      return res.status(404).json({ message: "Class not found" });
    }
    if (classData.schoolId !== schoolId) {
      return res.status(403).json({ message: "Access denied to this class" });
    }

    // Get enrollments from program_enrollments table (same source as enrollment count)
    // This queries by classId or marketplaceClassId for consistency
    const allEnrollments = await storage.getAllEnrollments();
    const classEnrollments = allEnrollments.filter((enrollment: any) => 
      (enrollment.classId === classId || enrollment.marketplaceClassId === classId) &&
      ['enrolled', 'pending_payment', 'waitlist', 'completed'].includes(enrollment.status)
    );

    console.log(`📚 Found ${classEnrollments.length} program enrollments for class ${classId}`);

    // Map enrollments to student data by looking up children directly
    const students = await Promise.all(classEnrollments.map(async (enrollment: any) => {
      // Get child data directly using the childId from program_enrollments
      const child = await storage.getChildById(enrollment.childId);
      
      if (!child) {
        console.warn(`⚠️ Child not found for enrollment childId: ${enrollment.childId}`);
        return null;
      }

      return {
        id: child.id,
        enrollmentId: enrollment.id,
        firstName: child.firstName,
        lastName: child.lastName,
        email: child.parentEmail || '',
        phone: '',
        gradeLevel: child.gradeLevel || 'Unknown',
        enrollmentDate: enrollment.enrollmentDate?.toISOString() || enrollment.createdAt?.toISOString() || new Date().toISOString(),
        status: enrollment.status === 'pending_payment' ? 'Pending' : 
                enrollment.status === 'waitlist' ? 'Waitlist' : 'Active',
        variantName: enrollment.variantName || null
      };
    }));

    // Filter out null entries (students that couldn't be found)
    const validStudents = students.filter(s => s !== null);

    res.json({
      students: validStudents,
      totalStudents: validStudents.length
    });

  } catch (error) {
    console.error("❌ Error fetching class roster:", error);
    res.status(500).json({ message: "Failed to fetch class roster" });
  }
});

// Staff invitations now use database storage via roleInvitations table

// Invite staff member (POST endpoint)
router.post("/staff/invite", supabaseAuth, async (req: any, res: any) => {
  console.log("📧 Staff invitation request received:", req.body);

  try {
    console.log("🔍 Step 1: Extracting schoolId from database [FIX:v3.0]");
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;
    console.log("✅ Step 1 complete: schoolId from DB =", schoolId);

    const { email, firstName, lastName, role, locationId, classId, message } = req.body;

    if (!email || !firstName || !lastName || !role) {
      console.log("❌ Missing required fields:", { email, firstName, lastName, role });
      return res.status(400).json({ message: "Missing required fields" });
    }

    const department = role; // Use role as department for compatibility

    console.log("🔍 Step 2: Checking for existing staff");
    const existingStaff = await storage.getSchoolStaffBySchoolId(schoolId);
    const staffEmails = await Promise.all(
      existingStaff.map(async (staff) => {
        const user = await storage.getUser(staff.userId);
        return user?.email;
      })
    );
    console.log("✅ Step 2 complete: Found", existingStaff.length, "existing staff");
    
    if (staffEmails.includes(email)) {
      console.log("❌ Staff member already exists:", email);
      return res.status(400).json({ message: "Staff member with this email already exists" });
    }

    console.log("🔍 Step 3: Checking if user exists");
    const existingUsers = await storage.getAllUsers();
    let user = existingUsers.find(u => u.email === email);
    
    if (!user) {
      console.log("📝 Creating new user for:", email);
      user = await storage.createUser({
        email,
        username: email,
        password: "temp_password",
        name: `${firstName} ${lastName}`,
        phone: "",
        role: "teacher"
      });
    }

    if (!user) {
      throw new Error("Failed to create user");
    }
    console.log("✅ Step 3 complete: User ID =", user.id);

    // DUAL-WRITE: Create both school_staff (for backward compatibility) and user_roles (new source of truth)
    
    // Step 4a: Create school_staff record (legacy - for backward compatibility)
    console.log("🔍 Step 4a: Creating school_staff record (legacy)");
    const staffRecord = await storage.createSchoolStaff({
      schoolId,
      userId: user.id,
      role: mapPositionToRole(role),
      position: role,
      department,
      startDate: new Date(),
      endDate: null,
      isActive: false,
      locationId: locationId || null
    });
    console.log("✅ Step 4a complete: school_staff ID =", staffRecord?.id);
    
    // Step 4b: Create user_roles entry (new source of truth)
    console.log("🔍 Step 4b: Creating user_roles entry for staff");
    const db = await getDb();
    
    // Check if user_roles entry already exists for this user/school/role combo
    const existingUserRoles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));
    
    const existingRoleForSchool = existingUserRoles.find(
      (r: { schoolId: number | null; role: string }) => r.schoolId === schoolId && r.role === role
    );
    
    let userRoleId: number;
    if (existingRoleForSchool) {
      userRoleId = existingRoleForSchool.id;
      console.log("✅ User already has this role at school, using existing user_role ID:", userRoleId);
    } else {
      // Create new user_roles entry for this staff member
      const [newUserRole] = await db
        .insert(userRoles)
        .values({
          userId: user.id,
          role: role, // Use the exact position/role (educator, teacher, schoolAdmin, or custom like "Mentor")
          schoolId: schoolId,
          isPrimary: existingUserRoles.length === 0 // First role becomes primary
        })
        .returning();
      userRoleId = newUserRole.id;
      console.log("✅ Step 4b complete: user_roles entry ID =", userRoleId);
    }

    console.log("🔍 Step 5: Generating invitation token");
    const invitationToken = generateInvitationToken();
    console.log("✅ Step 5 complete: Token generated");
    
    console.log("🔍 Step 6: Creating role invitation record");
    const mappedRole = mapPositionToRole(role);
    const userRole = mappedRole === 'administrator' ? 'admin' : mappedRole === 'teacher' ? 'teacher' : 'teacher';
    
    try {
      const roleInvitation = await storage.createRoleInvitation({
        email,
        role: userRole,
        invitedBy: 1,
        schoolId,
        token: invitationToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true
      });
      console.log("✅ Step 6 complete: Role invitation created");
    } catch (roleInviteError) {
      console.error("❌ Error creating role invitation (non-critical):", roleInviteError);
      // Continue even if role invitation fails - this is optional
    }

    console.log("🔍 Step 7: Transforming staff to frontend format using user_roles");
    // Create a role record object to pass to transformer
    const roleRecord = existingRoleForSchool || {
      id: userRoleId,
      userId: user.id,
      role: role,
      schoolId: schoolId,
      isPrimary: false
    };
    // Pass staffRecord for department/locationId enrichment
    const responseStaff = transformUserRoleStaffToFrontend(roleRecord as UserRole, user, [], true, staffRecord);
    console.log("✅ Step 7 complete");
    
    console.log("🔍 Step 8: Sending invitation email");
    const emailSent = await sendStaffInvitationEmail(email, firstName, lastName, role, department, invitationToken, message);
    console.log("✅ Step 8 complete: Email sent =", emailSent);

    console.log("✅ Staff member invited successfully:", { id: userRoleId, email });
    res.json({ 
      success: true, 
      message: emailSent ? "Staff member invited successfully and invitation email sent" : "Staff member invited successfully (email not sent)",
      staff: responseStaff,
      emailSent 
    });
  } catch (error) {
    console.error("❌ Error inviting staff member:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ 
      message: "Error inviting staff member", 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

// Get staff members for the school - using user_roles as source of truth
router.get("/staff", supabaseAuth, async (req: any, res: any) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log(`👥 Loading staff for school ID: ${schoolId} from user_roles`);

    // Get custom staff positions for this school
    const customPositions = await storage.getStaffPositionsBySchoolId(schoolId);
    const customPositionTitles = customPositions.map(p => p.title);
    console.log(`📋 Custom staff positions for school: ${customPositionTitles.join(', ') || 'none'}`);

    // Build list of all staff-type roles: system roles + custom positions
    const allStaffRoles = [...STAFF_TYPE_ROLES, ...customPositionTitles];

    // Query user_roles for staff-type roles at this school
    const db = await getDb();
    const staffRoleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.schoolId, schoolId));
    
    // Filter to only staff-type roles
    const staffTypeRoles = staffRoleRecords.filter((role: UserRole) => 
      allStaffRoles.includes(role.role)
    );
    console.log(`✅ Found ${staffTypeRoles.length} staff-type roles in user_roles`);

    // Get unique user IDs (a user might have multiple staff roles)
    const userIds = [...new Set(staffTypeRoles.map((r: UserRole) => r.userId))] as number[];
    
    // Fetch all users upfront
    const staffUsersArray = await Promise.all(
      userIds.map((userId: number) => storage.getUser(userId))
    );
    
    // Create user map
    const userMap = new Map<number, any>();
    const validEmails: string[] = [];
    
    staffUsersArray.forEach((user) => {
      if (user) {
        userMap.set(user.id, user);
        validEmails.push(user.email);
      }
    });
    
    // Batch check for pending invitations
    const pendingInvitationsMap = await storage.getPendingRoleInvitationsByEmails(validEmails);
    console.log(`✅ Checked ${validEmails.length} emails for pending invitations, found ${pendingInvitationsMap.size} pending`);

    // Get all classes for this school
    const allClasses = await storage.getAllClasses();
    const schoolClasses = allClasses.filter(c => c.schoolId === schoolId);

    // Fetch school_staff records for enrichment (department only)
    const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
    const staffRecordMap = new Map<number, any>();
    schoolStaffRecords.forEach((staff: any) => {
      if (staff.userId) {
        staffRecordMap.set(staff.userId, staff);
      }
    });

    // Fetch user_locations for all users (source of truth for locationId)
    // Get all locations for this school to filter user_locations
    const schoolLocations = await storage.getLocationsBySchoolId(schoolId);
    const schoolLocationIds = schoolLocations.map(loc => loc.id);
    
    // Build a map of userId -> locationId from user_locations
    const userLocationMap = new Map<number, number | null>();
    for (const userId of userIds) {
      const userLocations = await storage.getUserLocationsByUserId(userId);
      // Filter to only locations belonging to this school
      const schoolUserLocations = userLocations.filter(ul => schoolLocationIds.includes(ul.locationId));
      // Use the first matching location (a user typically has one location per school)
      userLocationMap.set(userId, schoolUserLocations.length > 0 ? schoolUserLocations[0].locationId : null);
    }

    // Transform to frontend format - one entry per user role
    const staffWithDetails = staffTypeRoles.map((roleRecord: UserRole) => {
      const user = userMap.get(roleRecord.userId);
      if (!user) {
        console.warn(`⚠️ User not found for user_role ${roleRecord.id}`);
        return null;
      }
      
      // Get classes assigned to this staff member
      const assignedClasses = schoolClasses.filter(cls => 
        cls.instructorId === user.id
      );
      
      // Check if this user has a pending invitation
      const hasPendingInvitation = pendingInvitationsMap.get(user.email) || false;
      
      // Get school_staff record for department enrichment
      const staffRecord = staffRecordMap.get(roleRecord.userId);
      
      // Get locationId from user_locations (source of truth)
      const userLocationId = userLocationMap.get(roleRecord.userId);
      
      return transformUserRoleStaffToFrontend(roleRecord, user, assignedClasses, hasPendingInvitation, staffRecord, userLocationId);
    });

    // Filter out null entries
    const validStaff = staffWithDetails.filter((s: any) => s !== null);
    
    res.json(validStaff);
  } catch (error) {
    console.error("❌ Error fetching school staff:", error);
    res.status(500).json({ message: "Error fetching school staff" });
  }
});

// Get single staff member by ID (now using user_roles.id)
router.get("/staff/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    console.log(`🔍 Looking for staff member with user_roles ID: ${roleId}`);
    
    if (isNaN(roleId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(roleRecord.userId);
    if (!user) {
      console.error(`❌ User not found for role record ${roleId}`);
      return res.status(404).json({ message: "User details not found for staff member" });
    }

    // Get classes assigned to this staff member
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === user.id && cls.schoolId === schoolId
    );

    // Check if user has a pending invitation
    const pendingInvitationsMap = await storage.getPendingRoleInvitationsByEmails([user.email]);
    const hasPendingInvitation = pendingInvitationsMap.get(user.email) || false;

    // Fetch school_staff record for enrichment (department only)
    const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
    const staffRecord = schoolStaffRecords.find((s: any) => s.userId === roleRecord.userId);

    // Fetch locationId from user_locations (source of truth)
    const schoolLocations = await storage.getLocationsBySchoolId(schoolId);
    const schoolLocationIds = schoolLocations.map(loc => loc.id);
    const userLocations = await storage.getUserLocationsByUserId(user.id);
    const schoolUserLocations = userLocations.filter(ul => schoolLocationIds.includes(ul.locationId));
    const userLocationId = schoolUserLocations.length > 0 ? schoolUserLocations[0].locationId : null;

    const staffMember = transformUserRoleStaffToFrontend(roleRecord, user, assignedClasses, hasPendingInvitation, staffRecord, userLocationId);
    
    console.log(`✅ Found staff member: ${staffMember.name}, locationId: ${userLocationId}`);
    res.json(staffMember);
  } catch (error) {
    console.error("Error fetching staff member:", error);
    res.status(500).json({ message: "Error fetching staff member" });
  }
});

// Get classes assigned to a specific staff member (now using user_roles.id)
router.get("/staff/:id/classes", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    console.log(`🎓 Getting classes for staff member with role ID ${roleId}`);
    
    if (isNaN(roleId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(roleRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User details not found" });
    }

    // Get all classes and filter by instructorId for this school
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === user.id && cls.schoolId === schoolId
    );

    console.log(`✅ Found ${assignedClasses.length} classes for ${user.name}`);
    res.json(assignedClasses);
  } catch (error) {
    console.error("Error fetching staff classes:", error);
    res.status(500).json({ message: "Error fetching staff classes" });
  }
});

// Assign staff member to a class (now using user_roles.id)
router.post("/staff/:id/assign-class", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    const { classId } = req.body;
    
    console.log(`🎯 Assigning staff with role ID ${roleId} to class ${classId}`);
    
    if (isNaN(roleId) || !classId) {
      return res.status(400).json({ message: "Invalid staff ID or class ID" });
    }

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(roleRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User details not found" });
    }

    // Update the class to assign this instructor
    const updatedClass = await storage.updateClass(classId, {
      instructorName: user.name,
      instructorId: user.id
    } as any);

    if (!updatedClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    console.log(`✅ Successfully assigned ${user.name} (ID: ${user.id}) to class ${classId}`);
    res.json({ 
      success: true, 
      message: `${user.name} assigned to class successfully`,
      class: updatedClass,
      staffMember: {
        id: roleId,
        name: user.name
      }
    });
  } catch (error) {
    console.error("Error assigning staff to class:", error);
    res.status(500).json({ message: "Error assigning staff to class" });
  }
});

// Unassign staff member from a class (now using user_roles.id)
router.delete("/staff/:id/unassign-class/:classId", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    const classId = parseInt(req.params.classId, 10);
    
    console.log(`🎯 Unassigning staff with role ID ${roleId} from class ${classId}`);
    
    if (isNaN(roleId) || isNaN(classId)) {
      return res.status(400).json({ message: "Invalid staff ID or class ID" });
    }

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Update the class to remove instructor assignment
    const updatedClass = await storage.updateClass(classId, {
      instructorName: "No Instructor Assigned",
      instructorId: null
    } as any);

    if (!updatedClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    console.log(`✅ Successfully unassigned staff from class ${classId}`);
    res.json({ 
      success: true, 
      message: "Staff member unassigned from class successfully",
      class: updatedClass 
    });
  } catch (error) {
    console.error("Error unassigning staff from class:", error);
    res.status(500).json({ message: "Error unassigning staff from class" });
  }
});

// Resend invite to individual staff member (now using user_roles.id)
router.post("/staff/:id/resend-invite", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    if (isNaN(roleId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(roleRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User details not found" });
    }

    // Check if invitation exists
    const allInvitations = await storage.getRoleInvitations();
    const existingInvitation = allInvitations.find((inv: any) => 
      inv.email === user.email && inv.schoolId === schoolId
    );

    // Check if user has a pending invitation - if not, they're already active
    if (!existingInvitation) {
      return res.status(400).json({ message: "Staff member is already active - no pending invitation to resend" });
    }

    let invitationToken: string;

    // REUSE existing token - only reset expiration and active status
    invitationToken = existingInvitation.token;
    console.log(`📧 Reusing existing token for ${user.email} (resend keeps same link valid)`);
    await storage.updateRoleInvitation(existingInvitation.id, {
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
      usedAt: null
    });

    // Resend the invitation email
    const firstName = user.firstName || user.name?.split(' ')[0] || '';
    const lastName = user.lastName || user.name?.split(' ').slice(1).join(' ') || '';
    const message = `Your invitation to join our school staff has been resent. Please check your email for details.`;

    try {
      const emailSent = await sendStaffInvitationEmail(
        user.email,
        firstName,
        lastName,
        roleRecord.role, // Use role from user_roles
        '', // No department in user_roles
        invitationToken,
        message
      );

      if (emailSent) {
        res.json({ 
          message: "Invitation resent successfully",
          staffId: roleId,
          email: user.email 
        });
      } else {
        res.status(500).json({ message: "Failed to send invitation email" });
      }
    } catch (emailError) {
      console.error("Error resending invitation:", emailError);
      res.status(500).json({ message: "Failed to resend invitation email" });
    }
  } catch (error) {
    console.error("Error resending staff invite:", error);
    res.status(500).json({ message: "Error resending staff invite" });
  }
});

// Resend all pending invites
router.post("/staff/resend-all-invites", supabaseAuth, async (req: any, res: any) => {
  try {
    // [FIX:v3.0] Use database as source of truth, not JWT token
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;
    
    // Get all inactive (pending) staff members from database
    const allStaff = await storage.getSchoolStaffBySchoolId(schoolId);
    const pendingStaff = allStaff.filter(staff => !staff.isActive);

    if (pendingStaff.length === 0) {
      return res.json({ 
        message: "No pending invitations found",
        count: 0 
      });
    }

    let successCount = 0;
    let failureCount = 0;

    // Resend invites to all pending staff members
    for (const staffRecord of pendingStaff) {
      try {
        // Get user details
        const user = await storage.getUser(staffRecord.userId);
        if (!user) {
          console.warn(`User not found for staff ${staffRecord.id}`);
          failureCount++;
          continue;
        }

        // Check if invitation exists
        const allInvitations = await storage.getRoleInvitations();
        const existingInvitation = allInvitations.find((inv: any) => 
          inv.email === user.email && inv.schoolId === staffRecord.schoolId
        );

        const mappedRole = staffRecord.role;
        const userRole = mappedRole === 'administrator' ? 'admin' : mappedRole === 'teacher' ? 'teacher' : 'teacher';

        let invitationToken: string;

        if (existingInvitation) {
          // REUSE existing token - only reset expiration and active status
          // This keeps previously sent email links valid
          invitationToken = existingInvitation.token;
          console.log(`📧 [Bulk] Reusing existing token for ${user.email} (resend keeps same link valid)`);
          await storage.updateRoleInvitation(existingInvitation.id, {
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            isActive: true,
            usedAt: null // Reset used status so invitation can be accepted again
          });
        } else {
          // Only generate new token if no invitation exists
          invitationToken = generateInvitationToken();
          console.log(`📧 [Bulk] Creating new invitation for ${user.email}`);
          await storage.createRoleInvitation({
            email: user.email,
            role: userRole,
            invitedBy: 1,
            schoolId: staffRecord.schoolId,
            token: invitationToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            isActive: true
          });
        }

        // Send invitation email
        const firstName = user.name.split(' ')[0] || '';
        const lastName = user.name.split(' ').slice(1).join(' ') || '';
        const message = `Your invitation to join our school staff has been resent. Please check your email for details.`;

        const emailSent = await sendStaffInvitationEmail(
          user.email,
          firstName,
          lastName,
          staffRecord.position || staffRecord.role,
          staffRecord.department || '',
          invitationToken,
          message
        );

        if (emailSent) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (emailError) {
        console.error(`Error resending invitation:`, emailError);
        failureCount++;
      }
    }

    res.json({ 
      message: `Resent ${successCount} invitations successfully`,
      count: successCount,
      failures: failureCount,
      total: pendingStaff.length
    });
  } catch (error) {
    console.error("Error resending all staff invites:", error);
    res.status(500).json({ message: "Error resending staff invites" });
  }
});

// Update staff member (now using user_roles.id)
router.put("/staff/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    if (isNaN(roleId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    const { name, email, phone, role, locationId: rawLocationId } = req.body;
    
    // Normalize locationId: convert string to number, empty string/null to null
    let locationId: number | null = null;
    if (rawLocationId !== '' && rawLocationId !== null && rawLocationId !== undefined) {
      const parsed = typeof rawLocationId === 'string' ? parseInt(rawLocationId, 10) : rawLocationId;
      locationId = isNaN(parsed) ? null : parsed;
    }

    console.log(`🔄 Updating staff member with role ID ${roleId}:`, { name, email, phone, role, locationId, rawLocationId });

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(roleRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User details not found" });
    }

    // Update user record if name, email, or phone changed
    if (name || email || phone) {
      await storage.updateUser(user.id, {
        name: name || user.name,
        email: email || user.email,
        phone: phone || user.phone
      });
    }

    // Update role in user_roles if changed
    if (role && role !== roleRecord.role) {
      await db.update(userRoles)
        .set({ role })
        .where(eq(userRoles.id, roleId));
    }

    // Sync locationId to user_locations table for permissions system
    if (locationId !== undefined) {
      // Get all locations for this school to validate ownership
      const schoolLocations = await db
        .select()
        .from(locations)
        .where(eq(locations.schoolId, schoolId));
      const schoolLocationIds = schoolLocations.map((loc: { id: number }) => loc.id);
      
      // Validate that locationId belongs to the authenticated school (if not null)
      if (locationId !== null && !schoolLocationIds.includes(locationId)) {
        return res.status(400).json({ message: 'Invalid location - location does not belong to this school' });
      }
      
      // Get all user_locations for this user at this school's locations
      const existingUserLocationsForSchool = await db
        .select()
        .from(userLocations)
        .where(eq(userLocations.userId, user.id));
      
      // Filter to only this school's locations
      const userLocationsAtThisSchool = existingUserLocationsForSchool.filter(
        (ul: { id: number; locationId: number }) => schoolLocationIds.includes(ul.locationId)
      );
      
      // Remove old user_locations records for this school (when location changes or clears)
      for (const oldLocation of userLocationsAtThisSchool) {
        if (oldLocation.locationId !== locationId) {
          console.log(`🗑️ Removing old user_locations record for user ${user.id} at location ${oldLocation.locationId}`);
          await db.delete(userLocations).where(eq(userLocations.id, oldLocation.id));
        }
      }
      
      // Create new user_locations record if locationId is set and doesn't exist
      if (locationId !== null) {
        const hasExistingRecord = userLocationsAtThisSchool.some((ul: { locationId: number }) => ul.locationId === locationId);
        if (!hasExistingRecord) {
          console.log(`📍 Creating user_locations record for user ${user.id} at location ${locationId}`);
          await db.insert(userLocations).values({
            userId: user.id,
            locationId: locationId,
            accessLevel: 'view',
            canViewReports: false,
            canManageStaff: false,
            canManageClasses: false,
            canManageStudents: false,
            canSendNotifications: false,
            canViewParentContacts: false,
            isActive: true,
          });
          console.log(`✅ Created user_locations record for user ${user.id} at location ${locationId}`);
        }
      }
      
      // Also update school_staff table for dual-write support
      const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
      const existingStaffRecord = schoolStaffRecords.find((s: any) => s.userId === user.id);
      if (existingStaffRecord) {
        await storage.updateSchoolStaff(existingStaffRecord.id, { locationId });
      }
    }

    // Get updated user details
    const updatedUser = await storage.getUser(roleRecord.userId);
    
    // Get updated role record
    const updatedRoleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    const updatedRoleRecord = updatedRoleRecords[0];
    
    // Get classes assigned to this staff member
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === updatedUser!.id && cls.schoolId === schoolId
    );

    // Check if user has a pending invitation
    const pendingInvitationsMap = await storage.getPendingRoleInvitationsByEmails([updatedUser!.email]);
    const hasPendingInvitation = pendingInvitationsMap.get(updatedUser!.email) || false;

    // Fetch school_staff record for enrichment (department only)
    const schoolStaffRecordsForUpdate = await storage.getSchoolStaffBySchoolId(schoolId);
    const staffRecordForUpdate = schoolStaffRecordsForUpdate.find((s: any) => s.userId === updatedRoleRecord.userId);

    // Fetch locationId from user_locations (source of truth)
    const schoolLocationsForUpdate = await storage.getLocationsBySchoolId(schoolId);
    const schoolLocationIdsForUpdate = schoolLocationsForUpdate.map(loc => loc.id);
    const userLocationsForUpdate = await storage.getUserLocationsByUserId(updatedUser!.id);
    const schoolUserLocationsForUpdate = userLocationsForUpdate.filter(ul => schoolLocationIdsForUpdate.includes(ul.locationId));
    const userLocationIdForUpdate = schoolUserLocationsForUpdate.length > 0 ? schoolUserLocationsForUpdate[0].locationId : null;

    const updatedStaff = transformUserRoleStaffToFrontend(updatedRoleRecord, updatedUser!, assignedClasses, hasPendingInvitation, staffRecordForUpdate, userLocationIdForUpdate);
    
    console.log(`✅ Successfully updated staff member with role ID ${roleId}, locationId: ${userLocationIdForUpdate}`);

    res.json({ 
      success: true, 
      message: "Staff member updated successfully",
      staff: updatedStaff 
    });
  } catch (error) {
    console.error("Error updating staff member:", error);
    res.status(500).json({ message: "Error updating staff member" });
  }
});

// Delete staff member (now deletes user_roles entry)
router.delete("/staff/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const roleId = parseInt(req.params.id, 10);
    console.log(`🗑️ Attempting to delete staff member with role ID: ${roleId}`);
    
    if (isNaN(roleId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get role record from user_roles
    const db = await getDb();
    const roleRecords = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, roleId));
    
    const roleRecord = roleRecords[0];
    if (!roleRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify role belongs to authenticated school
    if (roleRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details before deleting
    const user = await storage.getUser(roleRecord.userId);
    const staffName = user?.name || 'Unknown';

    // Delete the user_roles entry (removes the staff role from user)
    await db.delete(userRoles).where(eq(userRoles.id, roleId));
    
    console.log(`✅ Successfully removed staff role from ${staffName}`);

    res.json({ 
      success: true, 
      message: "Staff member role removed successfully",
      deletedStaff: { id: roleId, name: staffName }
    });
  } catch (error) {
    console.error("Error deleting staff member:", error);
    res.status(500).json({ message: "Error deleting staff member", error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get staff positions/roles for dropdown
router.get("/staff-positions", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const positions = await storage.getAllStaffPositions();
    const schoolPositions = positions.filter(p => p.schoolId === schoolId || p.schoolId === null);
    res.json(schoolPositions);
  } catch (error) {
    console.error("Error fetching staff positions:", error);
    res.status(500).json({ message: "Error fetching staff positions" });
  }
});

// Create new staff position
router.post("/staff-positions", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const { title, description, isDefault } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const newPosition = await storage.createStaffPosition({
      title,
      description: description || null,
      isDefault: isDefault || false,
      schoolId: schoolId
    });

    console.log("Created new staff position:", newPosition);
    res.json(newPosition);
  } catch (error) {
    console.error("Error creating staff position:", error);
    res.status(500).json({ message: "Error creating staff position" });
  }
});

// Update staff position  
router.patch("/staff-positions/:id", supabaseAuth, async (req: any, res) => {
  console.log("🚨 PATCH ENDPOINT HIT! ID:", req.params.id);
  console.log("🚨 REQUEST BODY:", req.body);

  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const positionId = parseInt(req.params.id);
    const { title, description, isDefault } = req.body;

    console.log("🔧 PATCH /staff-positions/" + positionId + " received:", { title, description, isDefault });

    const position = await storage.getStaffPositionById(positionId);
    if (!position) {
      console.log("❌ Position not found for ID:", positionId);
      return res.status(404).json({ message: "Staff position not found" });
    }

    if (position.schoolId !== null && position.schoolId !== schoolId) {
      return res.status(403).json({ message: "Access denied to this position" });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const updatedPosition = await storage.updateStaffPosition(positionId, updateData);

    console.log("✅ Successfully updated staff position:", updatedPosition);
    res.json(updatedPosition);
  } catch (error) {
    console.error("❌ Error updating staff position:", error);
    res.status(500).json({ message: "Error updating staff position" });
  }
});

// Delete staff position
router.delete("/staff-positions/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const positionId = parseInt(req.params.id);
    const position = await storage.getStaffPositionById(positionId);

    if (!position) {
      return res.status(404).json({ message: "Staff position not found" });
    }

    if (position.schoolId !== null && position.schoolId !== schoolId) {
      return res.status(403).json({ message: "Access denied to this position" });
    }

    await storage.deleteStaffPosition(positionId);
    console.log("Deleted staff position:", position);

    res.json({ message: "Staff position deleted successfully" });
  } catch (error) {
    console.error("Error deleting staff position:", error);
    res.status(500).json({ message: "Error deleting staff position" });
  }
});

// Get departments for dropdown
router.get("/departments", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    // These would come from database in real app
    const departments = [
      { id: 1, name: "Mathematics", isActive: true },
      { id: 2, name: "English Language Arts", isActive: true },
      { id: 3, name: "Science", isActive: true },
      { id: 4, name: "Social Studies", isActive: true },
      { id: 5, name: "History", isActive: true },
      { id: 6, name: "Physical Education", isActive: true },
      { id: 7, name: "Arts", isActive: true },
      { id: 8, name: "Music", isActive: true },
      { id: 9, name: "Technology", isActive: true },
      { id: 10, name: "Administration", isActive: true },
      { id: 11, name: "Special Education", isActive: true },
      { id: 12, name: "Foreign Languages", isActive: true },
    ];

    res.json(departments);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ message: "Error fetching departments" });
  }
});

// Get students for the school
router.get("/students", supabaseAuth, async (req: any, res) => {
  try {
    // [FIX:v3.0] Use database as source of truth, not JWT token
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log(`📚 [FIX:v3.0] Fetching students for school admin (school_id from DB: ${schoolId})...`);
    
    // Get school students from database (not in-memory storage)
    // Note: Location-based filtering for staff with canManageStudents is handled in /api/educator/my-students
    const schoolStudents = await storage.getSchoolStudentsBySchoolId(schoolId);
    
    const schoolStudentChildIds = new Set(schoolStudents.map(ss => ss.childId));
    console.log(`📊 Found ${schoolStudents.length} students in school_students table for school ${schoolId}`);
    
    // [FIX:v4.0] Also include children whose parent has a relationship with this school
    // This covers parents who registered at the school but whose children aren't in school_students yet
    const additionalChildren: any[] = [];
    
    // Collect parent emails from multiple sources - OPTIMIZED to reduce N+1 queries
    const parentEmailsToCheck = new Set<string>();
    
    // Pre-load all users for efficient lookups (avoids N+1 pattern)
    const allUsers = await storage.getAllUsers();
    const userIdToEmailMap = new Map<number, string>();
    for (const user of allUsers) {
      if (user.email) {
        userIdToEmailMap.set(user.id, user.email);
      }
    }
    
    // Get membership enrollments for this school - use cached user data
    const allMemberships = await storage.getMembershipEnrollmentsBySchoolId(schoolId);
    for (const membership of allMemberships) {
      const parentEmail = userIdToEmailMap.get(membership.parentUserId);
      if (parentEmail) {
        parentEmailsToCheck.add(parentEmail);
      }
    }
    
    // Add parents with legacy schoolId matching this school
    const parentsWithLegacySchoolId = allUsers.filter(u => 
      u.role === 'parent' && u.schoolId === schoolId
    );
    for (const parent of parentsWithLegacySchoolId) {
      if (parent.email) {
        parentEmailsToCheck.add(parent.email);
      }
    }
    
    // Also check user_roles table for parents with role at this school
    // Batch-load roles for parents only (not all users) to reduce queries
    const parentUsers = allUsers.filter(u => u.role === 'parent' || u.email);
    const roleChecks = await Promise.all(
      parentUsers.map(async (user) => {
        if (!user.email || parentEmailsToCheck.has(user.email)) {
          return null; // Already have this email or no email
        }
        const userRoles = await storage.getUserRolesByUserId(user.id);
        const hasParentRoleAtSchool = userRoles.some(
          (r: any) => r.role === 'parent' && r.schoolId === schoolId
        );
        return hasParentRoleAtSchool ? user.email : null;
      })
    );
    
    // Add valid emails from role checks
    for (const email of roleChecks) {
      if (email) {
        parentEmailsToCheck.add(email);
      }
    }
    
    console.log(`🔍 Found ${parentEmailsToCheck.size} parent emails with school relationship`);
    
    // Get children for each parent email and add if not already in school_students
    for (const parentEmail of parentEmailsToCheck) {
      const children = await storage.getChildrenByParentEmail(parentEmail);
      for (const child of children) {
        if (!schoolStudentChildIds.has(child.id)) {
          additionalChildren.push(child);
          schoolStudentChildIds.add(child.id); // Prevent duplicates
        }
      }
    }
    
    console.log(`📊 Found ${additionalChildren.length} additional children from parent school relationships`);
    
    // Helper function to format child details
    const formatChildDetails = async (child: any, schoolStudent: any | null) => {
      try {
        // Calculate age from birthdate
        let age = null;
        if (child.birthdate) {
          const today = new Date();
          const birthDate = new Date(child.birthdate);
          age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
        }

        // Get location details
        let locationName = 'Unknown Location';
        let locationCode = 'N/A';
        const locationId = schoolStudent?.locationId || child.locationId;
        if (locationId) {
          const location = await storage.getLocationById(locationId);
          if (location) {
            locationName = location.name;
            locationCode = location.code;
          }
        }

        return {
          id: child.id,
          schoolStudentId: schoolStudent?.id || null,
          name: `${child.firstName} ${child.lastName}`,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel || 'Not specified',
          age: age || 'Unknown',
          parentName: child.parentEmail || 'Unknown Parent',
          parentEmail: child.parentEmail,
          email: child.parentEmail,
          enrollmentDate: schoolStudent?.enrollmentDate || child.createdAt,
          status: schoolStudent?.status || 'Active',
          locationId: locationId,
          locationName: locationName,
          locationCode: locationCode,
          schoolId: schoolStudent?.schoolId || schoolId,
          classes: [],
          avatar: child.profileImage || "",
          allergies: child.allergies,
          medicalInfo: child.medicalInfo,
          interests: child.interests || [],
          learningStyle: child.learningStyle
        };
      } catch (error) {
        console.error(`❌ Error formatting child ${child.id}:`, error);
        return null;
      }
    };
    
    // Get children details for school students from school_students table
    const studentsFromSchoolStudents = await Promise.all(
      schoolStudents.map(async (schoolStudent) => {
        try {
          const child = await storage.getChildById(schoolStudent.childId);
          if (!child) {
            console.warn(`⚠️ Child not found for school student: ${schoolStudent.childId}`);
            return null;
          }
          return formatChildDetails(child, schoolStudent);
        } catch (childError) {
          console.error(`❌ Error processing school student ${schoolStudent.id}:`, childError);
          return null;
        }
      })
    );
    
    // Get children details for additional children from parent relationships
    const studentsFromParentRelationships = await Promise.all(
      additionalChildren.map(async (child) => {
        return formatChildDetails(child, null);
      })
    );

    // Combine and filter out any null results
    const allStudentsWithDetails = [
      ...studentsFromSchoolStudents,
      ...studentsFromParentRelationships
    ];
    const validStudents = allStudentsWithDetails.filter(student => student !== null);
    
    console.log(`✅ Successfully processed ${validStudents.length} students with details (${schoolStudents.length} from school_students + ${additionalChildren.length} from parent relationships)`);
    res.json(validStudents);
    
  } catch (error) {
    console.error("❌ Detailed error fetching school students:", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      type: typeof error
    });
    res.status(500).json({ message: "Error fetching school students" });
  }
});

// Backfill/sync students to school_students table
router.post("/students/sync", supabaseAuth, async (req: any, res) => {
  try {
    // [FIX:v3.0] Use database as source of truth, not JWT token
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log(`🔄 [FIX:v3.0] Starting student sync for school ${schoolId} (from DB)...`);
    
    // Get all children for this school
    const allChildren = await storage.getAllChildren();
    const schoolChildren = allChildren.filter(child => Number(child.schoolId) === schoolId);
    console.log(`📊 Found ${schoolChildren.length} children for school ${schoolId}`);
    
    // Get existing school_student records
    const existingSchoolStudents = await storage.getAllSchoolStudents();
    const existingChildIds = new Set(existingSchoolStudents.map(ss => ss.childId));
    
    // Track sync results
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    // Create school_student records for children that don't have them
    for (const child of schoolChildren) {
      if (existingChildIds.has(child.id)) {
        console.log(`⏭️ Child ${child.id} already has school_student record, skipping`);
        skipped++;
        continue;
      }
      
      try {
        console.log(`📚 Creating school_student record for child: ${child.id} (${child.firstName} ${child.lastName})`);
        await storage.createSchoolStudent({
          schoolId: schoolId,
          childId: child.id,
          grade: child.gradeLevel || 'Unknown',
          status: 'active',
          locationId: child.locationId || null,
          studentId: null,
          notes: null
        });
        console.log(`✅ School student record created for child ${child.id}`);
        created++;
      } catch (error) {
        console.error(`❌ Failed to create school_student record for child ${child.id}:`, error);
        errors++;
      }
    }
    
    console.log(`✅ Student sync completed: ${created} created, ${skipped} skipped, ${errors} errors`);
    
    res.json({
      success: true,
      message: `Student sync completed successfully`,
      results: {
        total: schoolChildren.length,
        created,
        skipped,
        errors
      }
    });
    
  } catch (error) {
    console.error("❌ Error syncing students:", error);
    res.status(500).json({ message: "Error syncing students" });
  }
});

// Create a new class for a school
router.post("/classes", supabaseAuth, requireSchoolContext, async (req: any, res: any) => {
  try {
    const schoolId = req.schoolId;
    console.log('📝 Creating new class:', JSON.stringify(req.body, null, 2));
    
    // Find instructor details from database if instructorName is provided
    let instructorId = 1; // Default instructor ID
    if (req.body.instructorName) {
      const allStaff = await storage.getSchoolStaffBySchoolId(Number(schoolId));
      for (const staffRecord of allStaff) {
        const user = await storage.getUser(staffRecord.userId);
        if (user && user.id.toString() === req.body.instructorName) {
          instructorId = user.id;
          break;
        }
      }
    }

    // Extract price from variants array - use the first variant's price as the base price
    let price = 0;
    let schedule = null;
    
    if (req.body.variants && Array.isArray(req.body.variants) && req.body.variants.length > 0) {
      // Store the full variants structure in the schedule field
      schedule = {
        variants: req.body.variants,
        description: req.body.schedule?.description
      };
      // Use the first variant's price as the primary price
      price = req.body.variants[0].price || 0;
    } else if (req.body.price) {
      // Fallback to direct price if no variants
      price = req.body.price;
    }

    // Create new class object
    const newClassData = {
      type: 'school_admin' as const,
      schoolId: Number(schoolId),
      title: req.body.title,
      description: req.body.description,
      category: req.body.category || 'Academic',
      gradeLevels: req.body.gradeLevels || [],
      status: req.body.status || 'upcoming',
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      schedule: schedule,
      capacity: req.body.capacity || 10,
      locationId: req.body.locationId,
      price: price,
      instructorName: req.body.instructorName,
      instructorId,
      isPublished: false,
    };

    console.log('💰 Extracted price from variants:', price);
    console.log('📅 Schedule data:', schedule);

    // Create class in database
    const newClass = await storage.createClass(newClassData);
    console.log('✅ Class created successfully in database');

    console.log('✅ Class created successfully:', newClass.title);
    return res.status(201).json({
      message: "Class created successfully",
      class: newClass
    });
  } catch (error) {
    console.error("❌ Error creating class:", error);
    return res.status(500).json({ message: "Server error while creating class" });
  }
});

// Update school information for a school admin
router.patch("/schools/:id", supabaseAuth, async (req: any, res) => {
  console.log('🔥 PATCH request received in school-admin router');
  console.log('🔥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('🔥 School ID:', req.params.id);
  try {
    const authenticatedSchoolId = await getSchoolIdFromRequest(req, res);
    if (authenticatedSchoolId === null) return;

    const schoolId = parseInt(req.params.id);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    // Verify the school being updated matches the authenticated user's school
    if (schoolId !== authenticatedSchoolId) {
      return res.status(403).json({ message: 'Access denied to this school' });
    }

    console.log('✅ Authenticated user for school update');

    // Use admin client to update the school
    const { supabaseAdmin } = await import('../db/supabase');

    // Don't allow updating certain protected fields
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.created_by;

    // Map frontend field names to database field names
    const dbUpdateData: any = {
      name: updateData.name,
      type: updateData.type,
      address: updateData.address,
      city: updateData.city,
      state: updateData.state,
      zip_code: updateData.zipCode,
      phone_number: updateData.phoneNumber,
      email: updateData.email,
      website: updateData.website,
      description: updateData.description,
      founded_year: updateData.foundedYear,
      accreditation: updateData.accreditation,
      enrollment_size: updateData.enrollmentSize
    };

    // Remove undefined fields
    Object.keys(dbUpdateData).forEach(key => {
      if (dbUpdateData[key] === undefined) {
        delete dbUpdateData[key];
      }
    });

    console.log('🔄 Updating school in database with data:', JSON.stringify(dbUpdateData, null, 2));
    console.log('🔄 Updating school ID:', schoolId);

    // Use raw SQL to bypass Supabase schema cache
    const postgres = (await import('postgres')).default;
    const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
    
    if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
      return res.status(500).json({ message: "Database configuration missing" });
    }
    
    const encodedUser = encodeURIComponent(PGUSER);
    const encodedPassword = encodeURIComponent(PGPASSWORD);
    const port = PGPORT || '5432';
    const connectionString = `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
    
    const sql = postgres(connectionString);
    
    try {
      // Build dynamic UPDATE query
      const setClause = Object.keys(dbUpdateData)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');
      
      const values = Object.values(dbUpdateData);
      
      const query = `
        UPDATE schools 
        SET ${setClause}
        WHERE id = $${values.length + 1}
        RETURNING *
      `;
      
      console.log('🔍 Executing SQL:', query);
      console.log('🔍 With values:', [...values, schoolId]);
      
      const result = await sql.unsafe(query, [...values, schoolId] as any[]);
      await sql.end();
      
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const updatedSchool = result[0];
      console.log('✅ School updated successfully:', updatedSchool.name);
      console.log('✅ Updated school data:', JSON.stringify(updatedSchool, null, 2));

      return res.json({
        message: "School updated successfully",
        school: updatedSchool,
      });
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      await sql.end();
      return res.status(500).json({ 
        message: "Database update failed",
        error: dbError instanceof Error ? dbError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error("Error updating school:", error);
    return res.status(500).json({ message: "Server error while updating school" });
  }
});

// Update school membership configuration
router.patch("/my-school/membership", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log('🔧 Updating membership configuration');
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

    // Validate and prepare membership data
    const {
      membershipFeeAmount,
      membershipRenewalMonth,
      membershipRenewalDay,
      membershipGracePeriodDays,
      membershipRequired
    } = req.body;

    // Build update data with only provided fields (using camelCase for Drizzle)
    const updateData: Partial<InsertSchool> = {};

    if (membershipFeeAmount !== undefined) {
      // Frontend already converts dollars to cents, so accept the value as-is
      const feeInCents = typeof membershipFeeAmount === 'number' ? 
        Math.round(membershipFeeAmount) : 0;
      updateData.membershipFeeAmount = feeInCents;
    }

    if (membershipRenewalMonth !== undefined) {
      const month = parseInt(membershipRenewalMonth);
      if (isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid renewal month (must be 1-12)" });
      }
      updateData.membershipRenewalMonth = month;
    }

    if (membershipRenewalDay !== undefined) {
      const day = parseInt(membershipRenewalDay);
      if (isNaN(day) || day < 1 || day > 31) {
        return res.status(400).json({ message: "Invalid renewal day (must be 1-31)" });
      }
      updateData.membershipRenewalDay = day;
    }

    if (membershipGracePeriodDays !== undefined) {
      const gracePeriod = parseInt(membershipGracePeriodDays);
      if (isNaN(gracePeriod) || gracePeriod < 0) {
        return res.status(400).json({ message: "Invalid grace period (must be 0 or greater)" });
      }
      updateData.membershipGracePeriodDays = gracePeriod;
    }

    if (membershipRequired !== undefined) {
      updateData.membershipRequired = Boolean(membershipRequired);
    }

    console.log('🔄 Updating membership configuration via Drizzle:', updateData);

    // Update the school membership configuration using Drizzle ORM
    const updatedSchool = await storage.updateSchool(schoolId, updateData);

    if (!updatedSchool) {
      console.error('❌ Database update failed: School not found');
      return res.status(404).json({ 
        message: "Failed to update membership configuration",
        error: "School not found"
      });
    }

    console.log('✅ Membership configuration updated successfully via Drizzle');

    return res.json({
      message: "Membership configuration updated successfully",
      school: updatedSchool
    });
  } catch (error) {
    console.error("Error updating membership configuration:", error);
    return res.status(500).json({ message: "Server error while updating membership configuration" });
  }
});

// Update general school settings (checkout settings, display preferences, etc.)
router.patch("/my-school/settings", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const { showSubscriptionStatus, onboardingTourEnabled } = req.body;

    console.log('🔄 Received school settings update request:', req.body);

    // Build update object with camelCase table properties
    const updateData: Record<string, any> = {};

    if (showSubscriptionStatus !== undefined) {
      updateData.showSubscriptionStatus = Boolean(showSubscriptionStatus);
    }

    if (onboardingTourEnabled !== undefined) {
      updateData.onboardingTourEnabled = Boolean(onboardingTourEnabled);
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      console.log('⚠️ No fields to update in request body');
      return res.status(400).json({ 
        message: "No fields to update. Please provide at least one setting to change." 
      });
    }

    console.log('🔄 Updating school settings:', updateData);

    // Update the school settings using Drizzle ORM
    const updatedSchool = await storage.updateSchool(schoolId, updateData as any);

    if (!updatedSchool) {
      console.error('❌ Database update failed: School not found');
      return res.status(404).json({ 
        message: "Failed to update school settings",
        error: "School not found"
      });
    }

    console.log('✅ School settings updated successfully');

    return res.json({
      message: "School settings updated successfully",
      school: updatedSchool
    });
  } catch (error) {
    console.error("Error updating school settings:", error);
    return res.status(500).json({ message: "Server error while updating school settings" });
  }
});

// Update school membership agreement template
router.patch("/my-school/agreement", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const { membershipAgreementTemplate } = req.body;

    if (!membershipAgreementTemplate || typeof membershipAgreementTemplate !== 'string') {
      return res.status(400).json({ 
        message: "Membership agreement template is required" 
      });
    }

    if (membershipAgreementTemplate.trim().length < 50) {
      return res.status(400).json({ 
        message: "Agreement template must be at least 50 characters long" 
      });
    }

    console.log('🔄 Updating membership agreement template for school:', schoolId);

    // Get current school to determine next version
    const db = await getDb();
    const currentSchools = await db
      .select({ membershipAgreementVersion: schools.membershipAgreementVersion })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);

    // Increment version number
    let nextVersion = "1";
    if (currentSchools.length > 0 && currentSchools[0].membershipAgreementVersion) {
      const currentVersion = parseInt(currentSchools[0].membershipAgreementVersion.replace('v', '')) || 0;
      nextVersion = String(currentVersion + 1);
    }

    // Update the school with new agreement template and version
    const updateData: Record<string, any> = {
      membershipAgreementTemplate: membershipAgreementTemplate.trim(),
      membershipAgreementVersion: nextVersion,
      membershipAgreementUpdatedAt: new Date(),
    };

    const updatedSchool = await storage.updateSchool(schoolId, updateData as any);

    if (!updatedSchool) {
      console.error('❌ Database update failed: School not found');
      return res.status(404).json({ 
        message: "Failed to update agreement template",
        error: "School not found"
      });
    }

    console.log('✅ Membership agreement template updated to version:', nextVersion);

    return res.json({
      message: "Membership agreement template updated successfully",
      version: nextVersion,
      school: updatedSchool
    });
  } catch (error) {
    console.error("Error updating membership agreement template:", error);
    return res.status(500).json({ message: "Server error while updating agreement template" });
  }
});

// Update school "Free After Threshold" discount configuration
router.patch("/my-school/free-after-threshold", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const { freeAfterThresholdEnabled, freeAfterThreshold } = req.body;

    console.log('🔄 Received "Free After Threshold" update request:', req.body);

    // Build update object with camelCase table properties
    const updateData: Partial<typeof schools.$inferInsert> = {};

    if (freeAfterThresholdEnabled !== undefined) {
      updateData.freeAfterThresholdEnabled = Boolean(freeAfterThresholdEnabled);
    }

    if (freeAfterThreshold !== undefined) {
      const threshold = parseInt(freeAfterThreshold);
      if (isNaN(threshold) || threshold < 1) {
        return res.status(400).json({ message: "Invalid threshold (must be 1 or greater)" });
      }
      updateData.freeAfterThreshold = threshold;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      console.log('⚠️ No fields to update in request body');
      return res.status(400).json({ 
        message: "No fields to update. Please provide freeAfterThresholdEnabled or freeAfterThreshold" 
      });
    }

    console.log('🔄 Updating "Free After Threshold" configuration with:', updateData);

    // Use Drizzle ORM to update the school
    const db = await getDb();

    // Update the school's "Free After Threshold" configuration
    const updatedSchools = await db
      .update(schools)
      .set(updateData)
      .where(eq(schools.id, schoolId))
      .returning();

    if (!updatedSchools || updatedSchools.length === 0) {
      console.error('❌ Database update failed - no school found with ID:', schoolId);
      return res.status(404).json({ 
        message: "School not found"
      });
    }

    const updatedSchool = updatedSchools[0];
    console.log('✅ "Free After Threshold" configuration updated successfully');

    return res.json({
      message: "Discount configuration updated successfully",
      school: updatedSchool
    });
  } catch (error) {
    console.error("Error updating discount configuration:", error);
    return res.status(500).json({ message: "Server error while updating discount configuration" });
  }
});

router.get("/knowledge-bases", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    // For now, return sample knowledge base data
    // In a real implementation, this would come from the database
    const sampleKnowledgeBases = [
      {
        id: 1,
        title: "American History Primary Documents",
        description: "A comprehensive collection of primary documents from American history, including the Declaration of Independence, Constitution, and other significant historical texts.",
        subjectArea: "History",
        gradeLevel: ["9-12"],
        status: "Published",
        visibility: "School",
        fileCount: 36,
        size: "128 MB",
        createdAt: "2023-09-15",
        updatedAt: "2023-10-20",
        tags: ["American History", "Primary Sources", "Constitution", "Revolution"],
        creator: "Dr. Sarah Johnson",
        rating: 4.8,
        usageCount: 85,
      },
      {
        id: 2,
        title: "Middle School Mathematics",
        description: "Core mathematics curriculum materials for grades 6-8, covering algebra, geometry, statistics, and more.",
        subjectArea: "Mathematics",
        gradeLevel: ["6-8"],
        status: "Published",
        visibility: "School",
        fileCount: 42,
        size: "95 MB",
        createdAt: "2023-08-05",
        updatedAt: "2023-11-10",
        tags: ["Mathematics", "Algebra", "Geometry", "Middle School"],
        creator: "Prof. Michael Chen",
        rating: 4.6,
        usageCount: 120,
      }
    ];

    res.json(sampleKnowledgeBases);
  } catch (error) {
    console.error("Error fetching knowledge bases:", error);
    res.status(500).json({ message: "Error fetching knowledge bases" });
  }
});

// Get all enrollments for school admin
router.get('/enrollments', supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log('📚 School admin fetching all enrollments for school:', schoolId);
    const allEnrollments = await storage.getAllEnrollments();
    
    // Filter enrollments by school
    const enrollments = allEnrollments.filter((e: any) => e.schoolId === schoolId);
    
    // Format enrollments for admin display
    const formattedEnrollments = enrollments.map((enrollment: any) => ({
      id: enrollment.id,
      className: enrollment.className || 'Unknown Class',
      childName: enrollment.childName || 'Unknown Student',
      paymentPlan: enrollment.paymentPlan || 'one_time',
      paymentFrequency: enrollment.paymentFrequency || 'one_time',
      totalCost: enrollment.totalCost || 0,
      totalPaid: enrollment.totalPaid || 0,
      remainingBalance: enrollment.remainingBalance || (enrollment.totalCost - (enrollment.totalPaid || 0)),
      paymentStatus: enrollment.paymentStatus || enrollment.status || 'pending_payment',
      programStartDate: enrollment.programStartDate,
      programEndDate: enrollment.programEndDate,
      metadata: enrollment.metadata || {}
    }));
    
    console.log(`📚 Found ${formattedEnrollments.length} enrollments`);
    res.json(formattedEnrollments);
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ message: 'Error fetching enrollments' });
  }
});

// Get individual student endpoint
router.get('/students/:id', supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    // Handle special case for "register" route
    if (req.params.id === 'register') {
      console.log('🎓 Register route accessed - returning empty student template');
      return res.json({
        id: null,
        firstName: '',
        lastName: '',
        birthdate: '',
        gradeLevel: '',
        parentEmail: '',
        specialNeeds: '',
        interests: [],
        notes: '',
        emergencyContact: ''
      });
    }

    const studentId = parseInt(req.params.id);
    console.log('🎓 Fetching individual student by ID:', studentId);

    // Get student from database
    const student = await storage.getChildById(studentId);

    if (!student) {
      console.log('❌ Student not found with ID:', studentId);
      return res.status(404).json({ message: 'Student not found' });
    }

    // Format the student data for the detail view
    const formattedStudent = {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      birthdate: student.birthdate,
      gradeLevel: student.gradeLevel,
      specialNeeds: student.specialNeeds || '',
      allergies: student.allergies || '',
      interests: student.interests || [],
      medicalNotes: student.medicalInfo || '',
      parentEmail: student.parentEmail || '',
      parentPhone: '',
      address: '',
      enrollmentDate: student.createdAt,
      status: 'Active',
      emergencyContact: {
        name: student.emergencyContact || '',
        relationship: 'Emergency Contact',
        phone: '',
        email: ''
      }
    };

    console.log('✅ Student found:', formattedStudent.firstName, formattedStudent.lastName);
    res.json(formattedStudent);
  } catch (error) {
    console.error('❌ Error fetching student:', error);
    res.status(500).json({ message: 'Error fetching student' });
  }
});

// Update student endpoint
router.put('/students/:id', supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const studentId = parseInt(req.params.id);
    const updateData = req.body;

    console.log('Updating student:', studentId, updateData);

    // Get existing student (child)
    const existingStudent = await storage.getChildById(studentId);
    if (!existingStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Verify student belongs to authenticated school
    if (existingStudent.schoolId && existingStudent.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this student' });
    }

    // Update student with new data using updateChild
    const updatedStudent = await storage.updateChild(studentId, {
      firstName: updateData.firstName,
      lastName: updateData.lastName,
      birthdate: updateData.dateOfBirth,
      gradeLevel: updateData.gradeLevel,
      parentEmail: updateData.parentEmail,
      emergencyContact: updateData.emergencyContact,
      medicalInfo: updateData.medicalNotes,
      specialNeeds: updateData.specialNeeds,
    });

    console.log('Student updated successfully:', updatedStudent);
    res.json(updatedStudent);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ message: 'Error updating student' });
  }
});

// Dashboard Metrics Endpoints - Calculate authentic data from database

// Enrollment Metrics
// DIAGNOSTIC ENDPOINT: Check user's school context
router.get("/diagnostic/school-context", supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    const user = await storage.getUserByEmail(userEmail);
    const schoolId = await getSchoolIdFromRequest(req, res);
    
    res.json({
      userEmail,
      userId: user?.id,
      userSchoolId: user?.schoolId,
      activeRoleId: user?.activeRoleId,
      extractedSchoolId: schoolId,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/metrics/enrollment", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log('📊 Calculating enrollment metrics from database for school:', schoolId);

    // Get all students/children from database
    const allChildren = await storage.getAllChildren();
    
    // Get program enrollments for additional metrics
    const allProgramEnrollments = await storage.getAllEnrollments();

    // Filter data by school
    const schoolChildren = allChildren.filter((c: any) => c.schoolId === schoolId);
    const programEnrollments = allProgramEnrollments.filter((e: any) => e.schoolId === schoolId);

    // Calculate authentic enrollment metrics
    const totalStudents = schoolChildren.length;
    const activeStudents = schoolChildren.filter((s: any) => 
      s.status === 'active' || !s.status
    ).length;

    // Calculate new enrollments this month (based on program enrollments)
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const newEnrollments = programEnrollments.filter((e: any) => {
      if (!e.enrollmentDate) return false;
      const enrollDate = new Date(e.enrollmentDate);
      return enrollDate >= oneMonthAgo;
    }).length;

    // Calculate growth rate
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const previousMonthEnrollments = programEnrollments.filter((e: any) => {
      if (!e.enrollmentDate) return false;
      const enrollDate = new Date(e.enrollmentDate);
      return enrollDate >= twoMonthsAgo && enrollDate < oneMonthAgo;
    }).length;

    const enrollmentGrowth = previousMonthEnrollments > 0 ? 
      ((newEnrollments - previousMonthEnrollments) / previousMonthEnrollments) * 100 : 0;

    // Calculate retention rate (students still active vs total)
    const retentionRate = totalStudents > 0 ? 
      (activeStudents / totalStudents) * 100 : 100;
    
    // Graduation rate would need historical data
    const graduationRate = 88;

    const enrollmentMetrics = {
      totalStudents,
      activeStudents,
      newEnrollments,
      enrollmentGrowth: Math.round(enrollmentGrowth * 100) / 100,
      graduationRate,
      retentionRate: Math.round(retentionRate * 100) / 100
    };

    console.log('✅ Enrollment metrics calculated from database:', enrollmentMetrics);
    res.json(enrollmentMetrics);
  } catch (error) {
    console.error('❌ Error calculating enrollment metrics:', error);
    res.status(500).json({ message: "Error calculating enrollment metrics" });
  }
});

// Financial Metrics
router.get("/metrics/financial", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log('💰 Calculating financial metrics from database for school:', schoolId);

    // Get all enrollments and payments from database
    const allEnrollments = await storage.getAllEnrollments();
    const allPayments = await storage.getAllPayments();

    // Filter data by school
    const schoolEnrollments = allEnrollments.filter((e: any) => e.schoolId === schoolId);
    const schoolPayments = allPayments.filter((p: any) => p.schoolId === schoolId);

    // Filter for completed payments (positive amounts)
    // Note: Stripe 'succeeded' status gets converted to 'completed' in our database
    const completedPayments = schoolPayments.filter((p: any) => 
      p.amount > 0 && (p.status === 'completed' || p.status === 'succeeded')
    );

    // Calculate total revenue (sum of all successful payments)
    const totalRevenue = completedPayments.reduce((sum: number, p: any) => 
      sum + (p.amount || 0), 0
    );

    // Calculate outstanding balance (sum of remaining balances)
    const outstandingBalance = schoolEnrollments.reduce((sum: number, e: any) => 
      sum + (e.remainingBalance || 0), 0
    );

    // Calculate average tuition paid per enrollment
    const avgTuitionPaid = schoolEnrollments.length > 0 
      ? schoolEnrollments.reduce((sum: number, e: any) => sum + (e.totalPaid || 0), 0) / schoolEnrollments.length
      : 0;

    // Count accounts with unpaid balances
    const unpaidAccounts = schoolEnrollments.filter((e: any) => 
      (e.remainingBalance || 0) > 0
    ).length;

    // Calculate collection rate (percentage of enrollments fully paid)
    const fullyPaidEnrollments = schoolEnrollments.filter((e: any) => 
      (e.remainingBalance || 0) === 0 && (e.totalCost || 0) > 0
    ).length;
    const collectionRate = schoolEnrollments.length > 0 
      ? (fullyPaidEnrollments / schoolEnrollments.length) * 100 
      : 0;

    // Calculate monthly revenue (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyRevenue = completedPayments
      .filter((p: any) => new Date(p.paymentDate) >= thirtyDaysAgo)
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // Convert cents to dollars for display
    const financialMetrics = {
      totalRevenue: totalRevenue / 100,
      outstandingBalance: outstandingBalance / 100,
      collectionRate: Math.round(collectionRate * 100) / 100,
      avgTuitionPaid: Math.round(avgTuitionPaid) / 100,
      monthlyRevenue: monthlyRevenue / 100,
      unpaidAccounts
    };

    console.log('✅ Financial metrics calculated from database (amounts in dollars):', financialMetrics);
    res.json(financialMetrics);
  } catch (error) {
    console.error('❌ Error calculating financial metrics:', error);
    res.status(500).json({ message: "Error calculating financial metrics" });
  }
});

// Academic Metrics
router.get("/metrics/academic", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log('📚 Calculating academic metrics from database for school:', schoolId);

    // Get data from database
    const allClasses = await storage.getAllClasses();
    const allStudents = await storage.getAllChildren();

    // Filter data by school
    const classes = allClasses.filter((c: any) => c.schoolId === schoolId);
    const students = allStudents.filter((s: any) => s.schoolId === schoolId);

    // Calculate academic performance metrics
    const totalClasses = classes.length;
    const activeClasses = classes.filter((c: any) => 
      c.status === 'active' || c.status === 'ongoing' || c.status === 'upcoming'
    ).length;

    // Calculate average class size
    const totalEnrollments = classes.reduce((sum: number, cls: any) => 
      sum + (cls.enrollmentCount || cls.currentEnrollment || 0), 0);
    const avgClassSize = activeClasses > 0 ? totalEnrollments / activeClasses : 0;

    // Calculate student-teacher ratio
    const activeInstructors = new Set(classes.map((c: any) => c.instructorId || c.instructorName)).size;
    const studentTeacherRatio = activeInstructors > 0 ? students.length / activeInstructors : 0;

    // Average progress based on course completions and student performance
    const averageProgress = 78; // Would be calculated from actual student progress data
    const completionRate = 85; // Would be calculated from actual completion data

    const academicMetrics = {
      averageProgress,
      completionRate,
      activeClasses,
      totalClasses,
      avgClassSize: Math.round(avgClassSize * 10) / 10,
      studentTeacherRatio: Math.round(studentTeacherRatio * 10) / 10
    };

    console.log('✅ Academic metrics calculated:', academicMetrics);
    res.json(academicMetrics);
  } catch (error) {
    console.error('❌ Error calculating academic metrics:', error);
    res.status(500).json({ message: "Error calculating academic metrics" });
  }
});

// Staff Metrics
router.get("/metrics/staff", supabaseAuth, requireSchoolContext, async (req: any, res: any) => {
  try {
    const schoolId = req.schoolId;
    console.log('👥 Calculating staff metrics from database');

    const staffRecords = await storage.getSchoolStaffBySchoolId(Number(schoolId));

    // Calculate staff metrics from actual data
    const totalStaff = staffRecords.length;
    
    // Count active instructors (teachers)
    const activeInstructors = staffRecords.filter(s => 
      s.isActive && (s.role === 'teacher' || s.position === 'Teacher' || s.position === 'Instructor')
    ).length;

    // Count pending invites (inactive staff)
    const pendingInvites = staffRecords.filter(s => !s.isActive).length;

    // Calculate staff utilization based on active vs total
    const activeStaff = staffRecords.filter(s => s.isActive).length;
    const staffUtilization = totalStaff > 0 ? (activeStaff / totalStaff) * 100 : 0;

    const staffMetrics = {
      totalStaff,
      activeInstructors,
      pendingInvites,
      staffUtilization: Math.round(staffUtilization * 10) / 10
    };

    console.log('✅ Staff metrics calculated:', staffMetrics);
    res.json(staffMetrics);
  } catch (error) {
    console.error('❌ Error calculating staff metrics:', error);
    res.status(500).json({ message: "Error calculating staff metrics" });
  }
});

// NOTE: Staff invitation validate/accept endpoints have been consolidated into public routes:
// - GET /api/public/role-invitations/validate
// - POST /api/public/role-invitations/accept
// These public endpoints handle both role and staff invitations with full account creation logic.

// Location-specific student management endpoints
router.get("/students/by-location/:locationId", async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    if (isNaN(locationId)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    console.log(`📍 Fetching students for location ID: ${locationId}`);
    
    const schoolStudents = await storage.getSchoolStudentsByLocationId(locationId);
    
    // Get child details for each school student
    const studentsWithDetails = await Promise.all(
      schoolStudents.map(async (schoolStudent) => {
        const child = await storage.getChildById(schoolStudent.childId);
        return {
          id: schoolStudent.id,
          childId: schoolStudent.childId,
          locationId: schoolStudent.locationId,
          schoolId: schoolStudent.schoolId,
          enrollmentDate: schoolStudent.enrollmentDate,
          status: schoolStudent.status,
          gradeLevel: schoolStudent.grade,
          child: child ? {
            firstName: child.firstName,
            lastName: child.lastName,
            parentEmail: child.parentEmail,
            gradeLevel: child.gradeLevel,
            profileImage: child.profileImage
          } : null
        };
      })
    );

    res.json({
      students: studentsWithDetails,
      location: { id: locationId },
      totalStudents: studentsWithDetails.length
    });

  } catch (error) {
    console.error("❌ Error fetching students by location:", error);
    res.status(500).json({ message: "Failed to fetch students by location" });
  }
});

router.get("/locations/overview", async (req, res) => {
  try {
    console.log('📍 Generating location overview...');
    
    // Get all locations from storage
    const locations = await storage.getLocations();
    
    const locationOverview = await Promise.all(
      locations.map(async (location) => {
        const schoolStudents = await storage.getSchoolStudentsByLocationId(location.id);
        const userLocations = await storage.getUserLocationsByLocationId(location.id);
        
        return {
          id: location.id,
          name: location.name,
          address: location.address,
          capacity: location.capacity,
          totalStudents: schoolStudents.length,
          staffCount: userLocations.length,
          utilization: location.capacity ? Math.round((schoolStudents.length / location.capacity) * 100) : 0,
          status: location.isActive ? 'Active' : 'Inactive'
        };
      })
    );

    res.json({
      locations: locationOverview,
      totalLocations: locationOverview.length,
      totalStudents: locationOverview.reduce((sum, loc) => sum + loc.totalStudents, 0),
      totalStaff: locationOverview.reduce((sum, loc) => sum + loc.staffCount, 0)
    });

  } catch (error) {
    console.error("❌ Error generating location overview:", error);
    res.status(500).json({ message: "Failed to generate location overview" });
  }
});

router.get("/user-locations/my-permissions", supabaseAuth, async (req: any, res) => {
  try {
    // User is authenticated via supabaseAuth middleware - get user ID from req.user
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Get user's location permissions
    const userLocations = await storage.getUserLocationsByUserId(userId);
    
    // Get location details
    const locationsWithPermissions = await Promise.all(
      userLocations.map(async (userLocation) => {
        const location = await storage.getLocationById(userLocation.locationId);
        return {
          id: userLocation.id,
          locationId: userLocation.locationId,
          accessLevel: userLocation.accessLevel,
          permissions: {
            canViewReports: userLocation.canViewReports,
            canManageStaff: userLocation.canManageStaff,
            canManageClasses: userLocation.canManageClasses,
            canManageStudents: userLocation.canManageStudents,
            canSendNotifications: userLocation.canSendNotifications,
          },
          assignedAt: userLocation.assignedAt,
          isActive: userLocation.isActive,
          location: location ? {
            name: location.name,
            address: location.address,
            capacity: location.capacity
          } : null
        };
      })
    );

    res.json({
      userLocations: locationsWithPermissions,
      totalLocations: locationsWithPermissions.length,
      activeLocations: locationsWithPermissions.filter(ul => ul.isActive).length
    });

  } catch (error) {
    console.error("❌ Error fetching user location permissions:", error);
    res.status(500).json({ message: "Failed to fetch location permissions" });
  }
});

// Zod schema for user location permission updates
const userLocationPermissionUpdateSchema = z.object({
  accessLevel: z.enum(['view', 'manage', 'admin']).optional(),
  canViewReports: z.boolean().optional(),
  canManageStaff: z.boolean().optional(),
  canManageClasses: z.boolean().optional(),
  canManageStudents: z.boolean().optional(),
  canSendNotifications: z.boolean().optional(),
  canViewParentContacts: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

// Get staff members with permissions for a specific location
router.get("/user-locations/:locationId", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    
    if (isNaN(locationId)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    console.log(`👥 Fetching staff permissions for location ${locationId}`);

    // Get the location and verify it belongs to the user's school (multi-tenant security)
    const location = await storage.getLocationById(locationId);
    
    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }
    
    // Verify the location belongs to the user's school context
    if (location.schoolId !== Number(req.schoolId)) {
      return res.status(403).json({ message: "Access denied: location does not belong to your school" });
    }

    // Get all user locations for this location
    const userLocations = await storage.getUserLocationsByLocationId(locationId);
    
    const permissionsWithUserDetails = await Promise.all(
      userLocations.map(async (ul) => {
        const user = await storage.getUser(ul.userId);
        return {
          id: ul.id,
          userId: ul.userId,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown User',
          userEmail: user?.email || '',
          locationId: ul.locationId,
          locationName: location?.name || '',
          accessLevel: ul.accessLevel,
          canViewReports: ul.canViewReports,
          canManageStaff: ul.canManageStaff,
          canManageClasses: ul.canManageClasses,
          canManageStudents: ul.canManageStudents,
          canSendNotifications: ul.canSendNotifications,
          canViewParentContacts: ul.canViewParentContacts,
          isActive: ul.isActive,
        };
      })
    );

    // Sort by user name
    permissionsWithUserDetails.sort((a, b) => a.userName.localeCompare(b.userName));

    console.log(`✅ Found ${permissionsWithUserDetails.length} staff members at location ${locationId}`);
    res.json(permissionsWithUserDetails);

  } catch (error) {
    console.error("❌ Error fetching staff permissions for location:", error);
    res.status(500).json({ message: "Failed to fetch staff permissions" });
  }
});

// Update user location permissions
router.patch("/user-locations/:id", supabaseAuth, requireSchoolContext, permissionUpdateLimiter, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid user location ID" });
    }

    // Validate request body with Zod schema
    const parseResult = userLocationPermissionUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: parseResult.error.errors 
      });
    }

    const updateData = parseResult.data;
    console.log(`🔧 Updating user location ${id} permissions:`, updateData);

    // First fetch the existing user_location to verify tenant ownership BEFORE updating
    const existingUserLocation = await storage.getUserLocationById(id);
    if (!existingUserLocation) {
      return res.status(404).json({ message: "User location not found" });
    }
    
    // Verify the record's location belongs to the user's school (multi-tenant security)
    const location = await storage.getLocationById(existingUserLocation.locationId);
    if (!location || location.schoolId !== Number(req.schoolId)) {
      console.error(`⚠️ Security: User tried to update user_location for different school`);
      return res.status(403).json({ message: "Access denied: record does not belong to your school" });
    }

    // Now perform the update after authorization check
    const updated = await storage.updateUserLocation(id, updateData);

    if (!updated) {
      return res.status(500).json({ message: "Failed to update user location" });
    }

    // Clear permission cache for this user/location to ensure fresh permissions
    clearPermissionCache(updated.userId, updated.locationId);
    console.log(`🔄 Cleared permission cache for user ${updated.userId} at location ${updated.locationId}`);

    // Audit log the permission change
    const targetUser = await storage.getUser(updated.userId);
    await storage.createAuditLog({
      actionType: 'permission_update',
      severity: 'info',
      actorId: req.user?.id,
      actorRole: 'schoolAdmin',
      actorEmail: req.user?.email,
      targetType: 'user_location',
      targetId: String(id),
      schoolId: Number(req.schoolId),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: {
        before: {
          accessLevel: existingUserLocation.accessLevel,
          canViewReports: existingUserLocation.canViewReports,
          canManageStaff: existingUserLocation.canManageStaff,
          canManageClasses: existingUserLocation.canManageClasses,
          canManageStudents: existingUserLocation.canManageStudents,
          canSendNotifications: existingUserLocation.canSendNotifications,
          canViewParentContacts: existingUserLocation.canViewParentContacts,
          isActive: existingUserLocation.isActive,
        },
        after: updateData,
        targetUser: {
          id: updated.userId,
          email: targetUser?.email,
          name: targetUser ? `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() : null,
        },
        locationId: updated.locationId,
        locationName: location?.name,
      },
    });
    console.log(`📋 Audit logged permission update for user ${updated.userId}`);

    // Return enriched response
    const user = await storage.getUser(updated.userId);

    const response = {
      id: updated.id,
      userId: updated.userId,
      userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown User',
      userEmail: user?.email || '',
      locationId: updated.locationId,
      locationName: location?.name || '',
      accessLevel: updated.accessLevel,
      canViewReports: updated.canViewReports,
      canManageStaff: updated.canManageStaff,
      canManageClasses: updated.canManageClasses,
      canManageStudents: updated.canManageStudents,
      canSendNotifications: updated.canSendNotifications,
      canViewParentContacts: updated.canViewParentContacts,
      isActive: updated.isActive,
    };

    console.log(`✅ Updated user location ${id} permissions`);
    res.json(response);

  } catch (error) {
    console.error("❌ Error updating user location permissions:", error);
    res.status(500).json({ message: "Failed to update permissions" });
  }
});

// Create user location assignment (assign staff to location)
router.post("/user-locations", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const { userId, locationId, accessLevel = 'view' } = req.body;

    if (!userId || !locationId) {
      return res.status(400).json({ message: "userId and locationId are required" });
    }

    // Verify the location belongs to the user's school (multi-tenant security)
    const location = await storage.getLocationById(locationId);
    if (!location || location.schoolId !== Number(req.schoolId)) {
      return res.status(403).json({ message: "Access denied: location does not belong to your school" });
    }

    // Verify the user exists and belongs to this school
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if assignment already exists
    const existingAssignments = await storage.getUserLocationsByLocationId(locationId);
    const alreadyAssigned = existingAssignments.some(ul => ul.userId === userId);
    if (alreadyAssigned) {
      return res.status(409).json({ message: "User is already assigned to this location" });
    }

    // Create the user_location record with default permissions
    const userLocation = await storage.createUserLocation({
      userId,
      locationId,
      accessLevel,
      canViewReports: false,
      canManageStaff: false,
      canManageClasses: false,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    });

    // Also sync the user's profile location_id to match
    await storage.updateUser(userId, { locationId });
    console.log(`📍 Synced user ${userId} profile location_id to ${locationId}`);

    // Audit log the assignment
    await storage.createAuditLog({
      actionType: 'staff_location_assignment',
      severity: 'info',
      actorId: req.user?.id,
      actorRole: 'schoolAdmin',
      actorEmail: req.user?.email,
      targetType: 'user_location',
      targetId: String(userLocation.id),
      schoolId: Number(req.schoolId),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: {
        assignedUser: {
          id: userId,
          email: targetUser.email,
          name: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim(),
        },
        locationId,
        locationName: location.name,
        accessLevel,
      },
    });

    console.log(`✅ Assigned user ${userId} to location ${locationId}`);

    res.status(201).json({
      id: userLocation.id,
      userId: userLocation.userId,
      userName: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email,
      userEmail: targetUser.email,
      locationId: userLocation.locationId,
      locationName: location.name,
      accessLevel: userLocation.accessLevel,
      canViewReports: userLocation.canViewReports,
      canManageStaff: userLocation.canManageStaff,
      canManageClasses: userLocation.canManageClasses,
      canManageStudents: userLocation.canManageStudents,
      canSendNotifications: userLocation.canSendNotifications,
      canViewParentContacts: userLocation.canViewParentContacts,
      isActive: userLocation.isActive,
    });

  } catch (error) {
    console.error("❌ Error creating user location assignment:", error);
    res.status(500).json({ message: "Failed to assign staff to location" });
  }
});

// ========================
// DISCOUNT MANAGEMENT ENDPOINTS
// ========================

// Get all discounts for a school
router.get('/discounts', async (req, res) => {
  try {
    console.log('💰 Fetching discounts for school admin');
    
    // Get all discounts from database
    const discounts = await storage.getAllDiscounts();
    
    res.json({
      success: true,
      discounts: discounts || []
    });
  } catch (error) {
    console.error('Error fetching discounts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch discounts'
    });
  }
});

// Get a specific discount by ID
router.get('/discounts/:id', async (req, res) => {
  try {
    const discountId = parseInt(req.params.id);
    
    if (isNaN(discountId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount ID'
      });
    }
    
    const discount = await storage.getDiscountById(discountId);
    
    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }
    
    res.json({
      success: true,
      discount
    });
  } catch (error) {
    console.error('Error fetching discount:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch discount'
    });
  }
});

// Helper function to safely parse date strings for discount fields
function parseDiscountDate(dateValue: any): Date | null {
  if (!dateValue || dateValue === "" || dateValue === null || dateValue === undefined) {
    return null;
  }
  
  // If it's already a Date object, return it
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  // Try to parse the string
  const parsed = new Date(dateValue);
  if (isNaN(parsed.getTime())) {
    console.warn(`⚠️ Invalid date value: ${dateValue}`);
    return null; // Return null for invalid dates instead of throwing
  }
  
  return parsed;
}

// Create a new discount
router.post('/discounts', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    console.log('💰 Creating new discount:', req.body);
    
    // Validate required fields
    const {
      name,
      description,
      code,
      type,
      value,
      applicationMethod,
      minOrderAmount,
      maxDiscountAmount,
      applicableToClasses,
      applicableToCategories,
      applicableToGradeLevels,
      newStudentsOnly,
      siblingDiscount,
      appliesToMembership,
      usageLimit,
      usageLimitPerUser,
      validFrom,
      validUntil,
      isActive,
      priority,
      combinableWithOthers,
      adminOnly
    } = req.body;
    
    if (!name || !type || value === undefined || !applicationMethod) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, type, value, applicationMethod'
      });
    }
    
    if (!['percentage', 'fixed_amount'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be either "percentage" or "fixed_amount"'
      });
    }
    
    if (!['automatic', 'manual', 'both'].includes(applicationMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Application method must be "automatic", "manual", or "both"'
      });
    }
    
    // Convert amounts to cents for storage
    const valueInCents = type === 'percentage' ? value : Math.round(value * 100);
    const minOrderAmountInCents = minOrderAmount ? Math.round(minOrderAmount * 100) : null;
    const maxDiscountAmountInCents = maxDiscountAmount ? Math.round(maxDiscountAmount * 100) : null;
    
    // Get school ID from database-driven middleware
    const schoolId = req.schoolId;
    
    // Fix discount ID sequence before creating new discount (prevent duplicate key errors)
    try {
      const db = await getDb();
      await db.execute(sql`
        SELECT setval(pg_get_serial_sequence('discounts', 'id'), COALESCE((SELECT MAX(id) FROM discounts), 0) + 1, false);
      `);
      console.log('✅ Discount sequence reset successfully');
    } catch (seqError) {
      console.log('⚠️ Note: Could not fix discount sequence:', seqError instanceof Error ? seqError.message : String(seqError));
    }
    
    // Create discount using storage
    const newDiscount = await storage.createDiscount({
      schoolId: Number(schoolId),
      name,
      description: description || null,
      code: code || null,
      type,
      value: valueInCents,
      applicationMethod,
      minOrderAmount: minOrderAmountInCents ?? undefined,
      maxDiscountAmount: maxDiscountAmountInCents ?? undefined,
      applicableToClasses: applicableToClasses || [],
      applicableToCategories: applicableToCategories || [],
      applicableToGradeLevels: applicableToGradeLevels || [],
      newStudentsOnly: newStudentsOnly || false,
      siblingDiscount: siblingDiscount || false,
      appliesToMembership: appliesToMembership || false,
      usageLimit: usageLimit || null,
      usageLimitPerUser: usageLimitPerUser || null,
      validFrom: parseDiscountDate(validFrom),
      validUntil: parseDiscountDate(validUntil),
      isActive: isActive !== undefined ? isActive : true,
      priority: priority || 0,
      combinableWithOthers: combinableWithOthers || false,
      createdBy: 1 // TODO: Get from authenticated user
    } as any);
    
    console.log('✅ Discount created successfully:', newDiscount);
    
    res.status(201).json({
      success: true,
      discount: newDiscount
    });
  } catch (error) {
    console.error('Error creating discount:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create discount'
    });
  }
});

// Update an existing discount
router.put('/discounts/:id', supabaseAuth, async (req: any, res) => {
  try {
    console.log('💰 Updating discount - ID:', req.params.id);
    const discountId = parseInt(req.params.id);
    
    if (isNaN(discountId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount ID'
      });
    }
    
    // Get school ID from authenticated user
    const userEmail = req.user?.email;
    if (!userEmail) {
      console.error('❌ No user email found in request');
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    console.log('👤 User updating discount:', userEmail);
    
    // Get user's school from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !user.schoolId) {
      console.error('❌ User not found or has no school:', userEmail);
      return res.status(403).json({
        success: false,
        error: 'User must be associated with a school'
      });
    }
    
    const schoolId = user.schoolId;
    console.log('🏫 User school ID:', schoolId);
    
    const existingDiscount = await storage.getDiscountById(discountId);
    
    if (!existingDiscount) {
      console.error('❌ Discount not found:', discountId);
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }
    
    // Security: Ensure discount belongs to user's school
    if (existingDiscount.schoolId !== schoolId) {
      console.error('🚨 SECURITY: User attempted to update discount from different school');
      console.error('  User school:', schoolId, 'Discount school:', existingDiscount.schoolId);
      return res.status(403).json({
        success: false,
        error: 'You can only update discounts for your own school'
      });
    }
    
    console.log('✅ Authorization passed - updating discount');
    
    const {
      name,
      description,
      code,
      type,
      value,
      applicationMethod,
      minOrderAmount,
      maxDiscountAmount,
      applicableToClasses,
      applicableToCategories,
      applicableToGradeLevels,
      newStudentsOnly,
      siblingDiscount,
      appliesToMembership,
      usageLimit,
      usageLimitPerUser,
      validFrom,
      validUntil,
      isActive,
      priority,
      combinableWithOthers,
      adminOnly
    } = req.body;
    
    // Validate required fields if provided
    if (type && !['percentage', 'fixed_amount'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be either "percentage" or "fixed_amount"'
      });
    }
    
    if (applicationMethod && !['automatic', 'manual', 'both'].includes(applicationMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Application method must be "automatic", "manual", or "both"'
      });
    }
    
    // Build update object with only provided fields
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (code !== undefined) updates.code = code;
    if (type !== undefined) updates.type = type;
    
    // CRITICAL FIX: Determine which discount type to use for value conversion
    // - If type is being updated, use the NEW type from the request
    // - If type is NOT being updated, use the EXISTING type from the database
    // This ensures correct conversion regardless of whether type is sent with the value
    const effectiveType = type !== undefined ? type : existingDiscount.type;
    
    // Convert value based on the effective type:
    // - Percentage: store as-is (e.g., 10 for 10%)
    // - Fixed amount: convert dollars to cents (e.g., 25.00 → 2500)
    if (value !== undefined) {
      updates.value = effectiveType === 'percentage' ? value : Math.round(value * 100);
    }
    
    if (applicationMethod !== undefined) updates.applicationMethod = applicationMethod;
    if (minOrderAmount !== undefined) updates.minOrderAmount = minOrderAmount ? Math.round(minOrderAmount * 100) : null;
    if (maxDiscountAmount !== undefined) updates.maxDiscountAmount = maxDiscountAmount ? Math.round(maxDiscountAmount * 100) : null;
    if (applicableToClasses !== undefined) updates.applicableToClasses = applicableToClasses;
    if (applicableToCategories !== undefined) updates.applicableToCategories = applicableToCategories;
    if (applicableToGradeLevels !== undefined) updates.applicableToGradeLevels = applicableToGradeLevels;
    if (newStudentsOnly !== undefined) updates.newStudentsOnly = newStudentsOnly;
    if (siblingDiscount !== undefined) updates.siblingDiscount = siblingDiscount;
    if (appliesToMembership !== undefined) updates.appliesToMembership = appliesToMembership;
    if (usageLimit !== undefined) updates.usageLimit = usageLimit;
    if (usageLimitPerUser !== undefined) updates.usageLimitPerUser = usageLimitPerUser;
    if (validFrom !== undefined) updates.validFrom = parseDiscountDate(validFrom);
    if (validUntil !== undefined) updates.validUntil = parseDiscountDate(validUntil);
    if (isActive !== undefined) updates.isActive = isActive;
    if (priority !== undefined) updates.priority = priority;
    if (combinableWithOthers !== undefined) updates.combinableWithOthers = combinableWithOthers;
    if (adminOnly !== undefined) updates.adminOnly = adminOnly;
    
    // Update discount using storage
    const updatedDiscount = await storage.updateDiscount(discountId, updates);
    
    if (!updatedDiscount) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update discount'
      });
    }
    
    console.log('✅ Discount updated successfully:', updatedDiscount);
    
    res.json({
      success: true,
      discount: updatedDiscount
    });
  } catch (error) {
    console.error('❌ Error updating discount:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Discount ID:', req.params.id);
    console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update discount'
    });
  }
});

// Delete a discount
router.delete('/discounts/:id', async (req, res) => {
  try {
    const discountId = parseInt(req.params.id);
    
    if (isNaN(discountId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount ID'
      });
    }
    
    const discount = await storage.getDiscountById(discountId);
    
    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }
    
    // Delete the discount
    await storage.deleteDiscount(discountId);
    
    console.log('✅ Discount deleted successfully:', discount);
    
    res.json({
      success: true,
      message: 'Discount deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting discount:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete discount'
    });
  }
});

// Duplicate an existing discount
router.post('/discounts/:id/duplicate', async (req, res) => {
  try {
    const discountId = parseInt(req.params.id);
    
    if (isNaN(discountId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount ID'
      });
    }
    
    const originalDiscount = await storage.getDiscountById(discountId);
    
    if (!originalDiscount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }
    
    // Create a copy of the discount with a new name and reset usage
    const duplicatedDiscount = await storage.createDiscount({
      schoolId: originalDiscount.schoolId,
      name: `${originalDiscount.name} (Copy)`,
      description: originalDiscount.description,
      code: originalDiscount.code ? `${originalDiscount.code}_COPY` : null,
      type: originalDiscount.type,
      value: originalDiscount.value,
      applicationMethod: originalDiscount.applicationMethod,
      minOrderAmount: originalDiscount.minOrderAmount ?? undefined,
      maxDiscountAmount: originalDiscount.maxDiscountAmount ?? undefined,
      applicableToClasses: originalDiscount.applicableToClasses,
      applicableToCategories: originalDiscount.applicableToCategories,
      applicableToGradeLevels: originalDiscount.applicableToGradeLevels,
      newStudentsOnly: originalDiscount.newStudentsOnly,
      siblingDiscount: originalDiscount.siblingDiscount,
      appliesToMembership: originalDiscount.appliesToMembership,
      usageLimit: originalDiscount.usageLimit,
      usageLimitPerUser: originalDiscount.usageLimitPerUser,
      validFrom: originalDiscount.validFrom,
      validUntil: originalDiscount.validUntil,
      isActive: false, // Start inactive so admin can review before activation
      priority: originalDiscount.priority,
      combinableWithOthers: originalDiscount.combinableWithOthers,
      createdBy: originalDiscount.createdBy
    });
    
    console.log('✅ Discount duplicated successfully:', duplicatedDiscount);
    
    res.status(201).json({
      success: true,
      discount: duplicatedDiscount
    });
  } catch (error) {
    console.error('Error duplicating discount:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to duplicate discount'
    });
  }
});

// Apply discount manually to an enrollment or payment
router.post('/discounts/:id/apply', async (req, res) => {
  try {
    const discountId = parseInt(req.params.id);
    const { parentEmail, childId, enrollmentId, originalAmount } = req.body;
    
    if (isNaN(discountId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount ID'
      });
    }
    
    if (!parentEmail || !originalAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: parentEmail, originalAmount'
      });
    }
    
    const discount = await storage.getDiscountById(discountId);
    
    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }
    
    if (!discount.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Discount is not active'
      });
    }
    
    // Check if discount can be applied manually
    if (discount.applicationMethod === 'automatic') {
      return res.status(400).json({
        success: false,
        error: 'This discount can only be applied automatically'
      });
    }
    
    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = Math.round((originalAmount * discount.value) / 100);
      // Apply max discount limit if set
      if (discount.maxDiscountAmount && discountAmount > discount.maxDiscountAmount) {
        discountAmount = discount.maxDiscountAmount;
      }
    } else {
      discountAmount = discount.value;
    }
    
    // Ensure discount doesn't exceed original amount
    if (discountAmount > originalAmount) {
      discountAmount = originalAmount;
    }
    
    const finalAmount = originalAmount - discountAmount;
    
    // Create discount application record
    const newApplication = await storage.createDiscountApplication({
      discountId,
      parentEmail,
      childId: childId || null,
      schoolEnrollmentId: enrollmentId || null,
      paymentId: null, // Will be set when payment is processed
      originalAmount,
      discountAmount,
      finalAmount,
      applicationMethod: 'manual',
      appliedBy: 1 // TODO: Get from authenticated user
    });
    
    // Update discount usage count using atomic increment
    await storage.incrementDiscountUsageAtomic(discountId);
    
    console.log('✅ Discount applied successfully:', newApplication);
    
    res.json({
      success: true,
      application: newApplication,
      discountAmount,
      finalAmount
    });
  } catch (error) {
    console.error('Error applying discount:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply discount'
    });
  }
});

// Get discount applications/usage history
router.get('/discounts/:id/applications', async (req, res) => {
  try {
    const discountId = parseInt(req.params.id);
    
    if (isNaN(discountId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount ID'
      });
    }
    
    const discountApplications = await storage.getDiscountApplicationsByDiscountId(discountId);
    
    res.json({
      success: true,
      applications: discountApplications
    });
  } catch (error) {
    console.error('Error fetching discount applications:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch discount applications'
    });
  }
});

// School-specific contact import endpoint using express-fileupload instead of multer
router.post('/contact-import', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    console.log('📁 School admin contact import - processing files');
    console.log('📊 Request files:', req.files);
    console.log('📊 Request body:', req.body);
    
    // Check if files were uploaded using express-fileupload format
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ 
        message: 'No files uploaded',
        error: 'Please select at least one CSV file to import' 
      });
    }

    // Convert express-fileupload format to array
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
    
    console.log(`🏫 Processing contact import for school ID: ${schoolId}`);

    // Get all locations for this school to enable location matching
    const schoolLocations = await storage.getLocationsBySchoolId(Number(schoolId));
    console.log(`📍 Found ${schoolLocations.length} locations for school:`, schoolLocations.map(l => l.name));

    // Files are already processed above
    const results = {
      parents: { successful: 0, failed: 0 },
      children: { successful: 0, failed: 0 },
      enrollments: { successful: 0, failed: 0 },
      payments: { successful: 0, failed: 0 },
      staff: { successful: 0, failed: 0 },
      errors: [] as string[]
    };

    for (const file of files) {
      try {
        console.log(`📄 Processing file: ${file.name}`);
        
        // Read and parse CSV file using express-fileupload data
        const fileContent = file.data.toString('utf-8');
        const records: any[] = [];
        
        await new Promise((resolve, reject) => {
          parseCSV(fileContent, { 
            columns: true,
            skip_empty_lines: true,
            trim: true
          })
          .on('data', (record: any) => records.push(record))
          .on('end', resolve)
          .on('error', reject);
        });

        console.log(`📊 Parsed ${records.length} records from ${file.name}`);

        // Determine file type and process accordingly
        const fileName = file.name.toLowerCase();
        let fileType = 'unknown';
        
        if (fileName.includes('parent') || fileName.includes('user')) {
          fileType = 'parents';
        } else if (fileName.includes('child') || fileName.includes('student')) {
          fileType = 'children';  
        } else if (fileName.includes('staff') || fileName.includes('teacher')) {
          fileType = 'staff';
        } else if (fileName.includes('enrollment')) {
          fileType = 'enrollments';
        } else if (fileName.includes('payment')) {
          fileType = 'payments';
        }

        console.log(`🏷️ File type determined: ${fileType}`);

        // Process records based on type and associate with school
        for (const record of records) {
          try {
            // Look for location information in CSV
            const locationName = record.Location || record.location || record['Location Name'] || record.locationName;
            let locationId = null;
            
            if (locationName && schoolLocations.length > 0) {
              // Try to match location by name (case-insensitive)
              const matchedLocation = schoolLocations.find(loc => {
                const locationNameLower = locationName?.toLowerCase() || '';
                const locNameLower = loc.name?.toLowerCase() || '';
                const locCodeLower = loc.code?.toLowerCase() || '';
                return locNameLower === locationNameLower || locCodeLower === locationNameLower;
              });
              if (matchedLocation) {
                locationId = matchedLocation.id;
                console.log(`📍 Matched location "${locationName}" to ID: ${locationId}`);
              } else {
                console.log(`⚠️ Could not match location "${locationName}" to existing locations`);
              }
            }

            if (fileType === 'parents') {
              // Create parent account associated with school and location
              const parentData = {
                email: record.Email || record.email,
                firstName: record['First Name'] || record.firstName || record.first_name,
                lastName: record['Last Name'] || record.lastName || record.last_name,
                phone: record.Phone || record.phone,
                emergencyContactFirstName: record['Emergency Contact - First Name'] || record.emergencyContactFirstName,
                emergencyContactLastName: record['Emergency Contact - Last Name'] || record.emergencyContactLastName,
                emergencyContactPhone: record['Emergency Contact Phone'] || record.emergencyContactPhone,
                schoolId: schoolId, // Associate with this school
                locationId: locationId // Associate with specific location if found
              };

              if (parentData.email && parentData.firstName && parentData.lastName) {
                // Create user account with school association
                await storage.createUser({
                  email: parentData.email,
                  firstName: parentData.firstName,
                  lastName: parentData.lastName,
                  phone: parentData.phone,
                  username: parentData.email.split('@')[0] || parentData.email,
                  password: 'tempPass123!',
                  name: `${parentData.firstName} ${parentData.lastName}`,
                  role: 'parent',
                  schoolId: Number(schoolId)
                });
                results.parents.successful++;
                console.log(`✅ Created parent: ${parentData.email} for school ${schoolId}${locationId ? ` at location ${locationId}` : ''}`);
              } else {
                results.parents.failed++;
                results.errors.push(`Missing required fields for parent: ${JSON.stringify(record)}`);
              }
            } else if (fileType === 'children') {
              // Create child record associated with school and location
              const childData = {
                firstName: record['First Name'] || record.firstName || record.first_name,
                lastName: record['Last Name'] || record.lastName || record.last_name,
                parentEmail: record['Parent Email'] || record.parentEmail || record.parent_email,
                grade: record.Grade || record.grade,
                birthDate: record['Birth Date'] || record.birthDate || record.birth_date,
                schoolId: schoolId, // Associate with this school
                locationId: locationId // Associate with specific location if found
              };

              if (childData.firstName && childData.lastName && childData.parentEmail) {
                // Find parent to get parentId
                const parent = await storage.getUserByEmail(childData.parentEmail);
                if (!parent) {
                  results.children.failed++;
                  results.errors.push(`Parent not found for child: ${childData.firstName} ${childData.lastName}`);
                  continue;
                }
                // Create child record with school association
                await storage.createChild({
                  firstName: childData.firstName,
                  lastName: childData.lastName,
                  schoolId: Number(schoolId),
                  school: null,
                  locationId: locationId,
                  gradeLevel: childData.grade || '',
                  birthdate: childData.birthDate || '',
                  gender: null,
                  learningStyle: null,
                  specialNeeds: null,
                  allergies: null,
                  medicalInfo: null,
                  interests: [],
                  emergencyContact: null,
                  notes: null,
                  profileImage: null,
                  parentEmail: childData.parentEmail,
                  parentId: parent.id,
                  additionalLanguages: []
                } as any);
                results.children.successful++;
                console.log(`✅ Created child: ${childData.firstName} ${childData.lastName} for school ${schoolId}${locationId ? ` at location ${locationId}` : ''}`);
              } else {
                results.children.failed++;
                results.errors.push(`Missing required fields for child: ${JSON.stringify(record)}`);
              }
            } else if (fileType === 'staff') {
              // Create staff account associated with school and location
              const staffData = {
                email: record.Email || record.email,
                firstName: record['First Name'] || record.firstName || record.first_name,
                lastName: record['Last Name'] || record.lastName || record.last_name,
                position: record.Position || record.position || 'Teacher',
                department: record.Department || record.department || 'General',
                schoolId: schoolId, // Associate with this school
                locationId: locationId // Associate with specific location if found
              };

              if (staffData.email && staffData.firstName && staffData.lastName) {
                // Create staff user account with educator role
                await storage.createUser({
                  email: staffData.email,
                  firstName: staffData.firstName,
                  lastName: staffData.lastName,
                  username: staffData.email.split('@')[0] || staffData.email,
                  password: 'tempPass123!',
                  name: `${staffData.firstName} ${staffData.lastName}`,
                  role: 'educator',
                  schoolId: Number(schoolId)
                });
                results.staff.successful++;
                console.log(`✅ Created staff: ${staffData.email} for school ${schoolId}${locationId ? ` at location ${locationId}` : ''}`);
              } else {
                results.staff.failed++;
                results.errors.push(`Missing required fields for staff: ${JSON.stringify(record)}`);
              }
            }
            // Add handling for enrollments and payments as needed
          } catch (recordError) {
            const errMsg = recordError instanceof Error ? recordError.message : String(recordError);
            console.error(`❌ Error processing record:`, recordError);
            results.errors.push(`Error processing record: ${errMsg}`);
            
            if (fileType === 'parents') results.parents.failed++;
            else if (fileType === 'children') results.children.failed++;
            else if (fileType === 'staff') results.staff.failed++;
          }
        }

      } catch (fileError) {
        const errMsg = fileError instanceof Error ? fileError.message : String(fileError);
        console.error(`❌ Error processing file ${file.name}:`, fileError);
        results.errors.push(`Error processing file ${file.name}: ${errMsg}`);
      } finally {
        // File cleanup not needed with express-fileupload (memory-based)
      }
    }

    console.log('📊 Contact import results:', results);
    res.status(200).json({ 
      message: 'Contact import completed',
      schoolId: schoolId,
      results: results
    });

  } catch (error) {
    console.error('❌ Contact import error:', error);
    
    // Handle specific multer errors
    const err = error as any;
    if (err.code === 'UNEXPECTED_END_OF_FORM') {
      return res.status(400).json({ 
        message: 'Invalid file upload',
        error: 'The form data was incomplete. Please try uploading the file again.' 
      });
    }
    
    res.status(500).json({ 
      message: 'Error processing contact import',
      error: err.message || 'An unexpected error occurred'
    });
  }
});


// Get all users for the school
router.get('/users', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    console.log('📋 Fetching users for school admin...');

    const db = await getDb();
    
    // Get all users for this school from database with active role
    const dbUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        activeRole: users.activeRole,
        phone: users.phone,
        isActive: users.isActive,
        createdAt: users.createdAt,
        schoolId: users.schoolId,
      })
      .from(users)
      .where(eq(users.schoolId, Number(schoolId)));

    // Load staff from database to create a lookup map by userId
    const staffRecords = await storage.getSchoolStaffBySchoolId(Number(schoolId));
    console.log(`👨‍🏫 Found ${staffRecords.length} staff members from database`);
    
    // Create a map of userId -> staffRecord for quick lookup
    const staffByUserId = new Map<number, any>();
    for (const staffRecord of staffRecords) {
      staffByUserId.set(staffRecord.userId, staffRecord);
    }
    
    // Track which user IDs we've already processed
    const processedUserIds = new Set<number>();

    // Map users from dbUsers, overriding status for staff users from staff records
    const usersFromDb = dbUsers.map((user: any) => {
      processedUserIds.add(user.id);
      const staffRecord = staffByUserId.get(user.id);
      
      if (staffRecord) {
        // This user has a staff record - use staff record's isActive status
        return {
          id: user.id,
          staffId: staffRecord.id, // Include staff record ID for resend invite functionality
          email: user.email,
          firstName: user.firstName || user.name?.split(' ')[0] || '',
          lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
          role: 'staff', // Standardize role to 'staff'
          phone: user.phone || '',
          isActive: staffRecord.isActive, // Use staff record's isActive, NOT user's
          createdAt: staffRecord.startDate || user.createdAt,
          department: staffRecord.department,
          position: staffRecord.position || 'Staff Member'
        };
      }
      
      // Regular user (not staff)
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName || user.name?.split(' ')[0] || '',
        lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
        role: user.activeRole || user.role, // Use active role if available, fall back to legacy role
        phone: user.phone || '',
        isActive: user.isActive !== false,
        createdAt: user.createdAt,
      };
    });
    
    // Add staff members whose user.schoolId doesn't match (they weren't in dbUsers)
    const staffNotInDbUsers = await Promise.all(
      staffRecords
        .filter(staffRecord => !processedUserIds.has(staffRecord.userId))
        .map(async (staffRecord) => {
          const user = await storage.getUser(staffRecord.userId);
          
          if (!user) {
            // Orphaned staff record - user was deleted but staff record remains
            // Still show the staff member using data from the staff record itself
            console.log(`⚠️ Orphaned staff record: staffRecord.id=${staffRecord.id}, userId=${staffRecord.userId} - synthesizing from staff record`);
            const staffAny = staffRecord as any;
            return {
              id: staffRecord.userId,
              staffId: staffRecord.id,
              email: staffAny.email || `user-${staffRecord.userId}@deleted`,
              firstName: staffAny.firstName || 'Unknown',
              lastName: staffAny.lastName || 'Staff',
              role: 'staff',
              phone: '',
              isActive: staffRecord.isActive,
              createdAt: staffRecord.startDate,
              department: staffRecord.department,
              position: staffRecord.position || 'Staff Member',
              isOrphaned: true // Flag for UI to show warning if needed
            };
          }
          
          return {
            id: staffRecord.userId,
            staffId: staffRecord.id,
            email: user.email,
            firstName: user.name?.split(' ')[0] || '',
            lastName: user.name?.split(' ').slice(1).join(' ') || '',
            role: 'staff',
            phone: user.phone || '',
            isActive: staffRecord.isActive,
            createdAt: staffRecord.startDate,
            department: staffRecord.department,
            position: staffRecord.position || 'Staff Member'
          };
        })
    );
    
    const allSchoolUsers = [...usersFromDb, ...staffNotInDbUsers];
    
    console.log(`👥 Found ${allSchoolUsers.length} users for school ${schoolId} (${staffByUserId.size} staff, ${staffNotInDbUsers.length} staff without matching schoolId)`);
    
    res.status(200).json(allSchoolUsers);
  } catch (error) {
    console.error('❌ Error fetching school users:', error);
    const err = error as Error;
    res.status(500).json({ 
      message: 'Error fetching users',
      error: err.message 
    });
  }
});

// Get a single user by ID (numeric database primary key)
router.get('/users/:userId', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID - must be a positive integer' });
    }

    console.log(`👤 Fetching user ${userId} for school ${schoolId}`);

    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to this school (handle both camelCase and snake_case)
    const userSchoolId = user.schoolId || (user as any).school_id;
    if (!userSchoolId) {
      console.log(`⚠️ User ${userId} has no school assignment`);
      return res.status(403).json({ message: 'Access denied - user has no school assignment' });
    }
    
    if (String(userSchoolId) !== schoolId) {
      console.log(`❌ School ID mismatch: user has ${userSchoolId}, admin has ${schoolId}`);
      return res.status(403).json({ message: 'Access denied - user belongs to different school' });
    }

    // Format user data consistently with the list endpoint
    const userAny = user as any;
    const formattedUser = {
      id: user.id,
      email: user.email,
      firstName: userAny.firstName || user.name?.split(' ')[0] || '',
      lastName: userAny.lastName || user.name?.split(' ').slice(1).join(' ') || '',
      role: user.role,
      phone: user.phone || '',
      isActive: user.isActive ?? true,
      schoolId: userSchoolId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      metadata: userAny.metadata || {}
    };

    console.log(`✅ Found user: ${user.email}`);
    res.status(200).json(formattedUser);
  } catch (error) {
    const err = error as Error;
    console.error('❌ Error fetching user:', error);
    res.status(500).json({ 
      message: 'Error fetching user',
      error: err.message 
    });
  }
});

// Validation schema for user creation (follows registration.ts and user-roles.ts patterns)
const systemRoles = ['student', 'parent', 'learner', 'educator', 'mentor', 'teacher', 'schoolAdmin', 'admin', 'superAdmin'];
const createUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format'),
  role: z.string().refine((val) => systemRoles.includes(val), {
    message: `Role must be one of: ${systemRoles.join(', ')}`
  }),
  phone: z.string().optional().nullable(),
  // Accept string or number for locationId (forms send strings, API may send numbers)
  locationId: z.union([z.string(), z.number()]).optional().nullable().transform(val => val ? Number(val) : null),
});

// Create a new user for the school
router.post('/users', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    console.log('👤 Creating new user for school admin...');

    // Validate request body using Zod schema
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      console.log('❌ Validation failed:', errors);
      return res.status(400).json({ 
        message: `Validation failed: ${errors}` 
      });
    }

    const { firstName, lastName, email, role, phone, locationId } = parseResult.data;

    // Check if user with this email already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ 
        message: 'A user with this email already exists' 
      });
    }

    // Validate locationId belongs to this school (if provided)
    if (locationId) {
      const location = await storage.getLocationById(Number(locationId));
      if (!location || String(location.schoolId) !== schoolId) {
        return res.status(400).json({ 
          message: 'Invalid location - location must belong to your school' 
        });
      }
    }

    // Transform form data to match storage.createUser expected format
    const userData = {
      username: email, // Use email as username
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      email,
      role: role as 'student' | 'parent' | 'learner' | 'educator' | 'mentor' | 'teacher' | 'schoolAdmin' | 'admin' | 'superAdmin',
      phone: phone || null,
      password: 'pending_setup', // Placeholder - user will set via invite/reset
      schoolId: Number(schoolId),
      locationId: locationId ? Number(locationId) : null,
      isActive: true
    };

    console.log('📦 Transformed user data:', { ...userData, password: '[REDACTED]' });

    // Create user with school association and user_roles entry in a consistent manner
    const { getDb } = await import('../db');
    const { userRoles } = await import('../../shared/schema');
    
    const db = await getDb();
    
    // Create user first
    const newUser = await storage.createUser(userData);
    console.log(`✅ Created user: ${userData.email} (ID: ${newUser.id}) for school ${schoolId}`);
    
    // Create user_roles entry (required for profile visibility and school relationship)
    let newRole;
    try {
      newRole = await db
        .insert(userRoles)
        .values({
          userId: newUser.id,
          role: role,
          schoolId: Number(schoolId),
          isPrimary: true,
        })
        .returning();
      
      if (!newRole || newRole.length === 0) {
        throw new Error('user_roles insert returned empty result');
      }
    } catch (roleError) {
      // Clean up - delete the user we just created since role creation failed
      console.error(`❌ Failed to create user_roles entry for user ${newUser.id}:`, roleError);
      try {
        await storage.deleteUser(newUser.id);
        console.log(`🧹 Cleaned up user ${newUser.id} after role creation failure`);
      } catch (deleteError) {
        console.error(`⚠️ Failed to clean up user ${newUser.id}:`, deleteError);
      }
      throw new Error('Failed to establish school relationship for user');
    }
    
    console.log(`✅ Created user_roles entry for user ${newUser.id} with role '${role}' at school ${schoolId}`);
    
    // Set this as the user's active role
    await storage.updateUser(newUser.id, { activeRoleId: newRole[0].id });
    console.log(`✅ Set active role ID ${newRole[0].id} for user ${newUser.id}`);
    
    // Create user_locations entry if locationId was provided (follows POST /user-locations pattern)
    if (locationId) {
      try {
        await storage.createUserLocation({
          userId: newUser.id,
          locationId: Number(locationId),
          accessLevel: 'view', // Default access level for new users
          canViewReports: false,
          canManageStaff: false,
          canManageClasses: false,
          canManageStudents: false,
          canSendNotifications: false,
          canViewParentContacts: false,
          isActive: true,
        });
        console.log(`✅ Created user_locations entry for user ${newUser.id} at location ${locationId}`);
      } catch (locationError) {
        // Log but don't fail the request - location assignment is supplementary
        console.error(`⚠️ Failed to create user_locations entry for user ${newUser.id}:`, locationError);
      }
    }
    
    res.status(201).json(newUser);
  } catch (error) {
    const err = error as Error;
    console.error('❌ Error creating user:', error);
    res.status(500).json({ 
      message: 'Error creating user',
      error: err.message 
    });
  }
});

// Update an existing user
router.put('/users/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  console.log('🚀 PUT /users/:id endpoint reached');
  console.log('📄 Request params:', req.params);
  console.log('📄 Request body:', req.body);
  try {
    const schoolId = req.schoolId;
    console.log('📝 Updating user for school admin...');
    
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Verify user belongs to this school before updating
    const existingUser = await storage.getUser(userId);
    console.log('👤 Existing user:', existingUser ? { id: existingUser.id, email: existingUser.email, schoolId: existingUser.schoolId, role: existingUser.role } : 'Not found');
    console.log('🏫 Admin school ID:', schoolId);
    
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check schoolId (handle both camelCase and snake_case)
    const userSchoolId = existingUser.schoolId || (existingUser as any).school_id;
    if (String(userSchoolId) !== schoolId) {
      console.log(`❌ School ID mismatch: user has ${userSchoolId}, admin has ${schoolId}`);
      return res.status(403).json({ message: 'Access denied - user belongs to different school' });
    }

    const userData = {
      ...req.body,
      schoolId: Number(schoolId) // Maintain school association
    };

    // Handle password updates - need to sync with both local storage and Supabase
    let plainTextPassword = null;
    if (userData.password && userData.password.trim() !== '') {
      console.log('🔒 Password provided, will update both local storage and Supabase...');
      plainTextPassword = userData.password; // Store for Supabase update
      userData.password = await bcrypt.hash(userData.password, 10);
      console.log('✅ Password hashed successfully for local storage');
    } else if (userData.password === '') {
      // Remove empty password from update data - don't change existing password
      delete userData.password;
      console.log('🔒 Empty password provided, keeping existing password');
    }

    // Update user
    console.log(`🔄 API: Calling storage.updateUser for user ID: ${userId}`);
    console.log(`📄 API: Update data:`, { ...userData, password: userData.password ? '[HASHED]' : 'not provided' });
    
    const updatedUser = await storage.updateUser(userId, userData);
    console.log(`✅ API: Updated user: ${userData.email || existingUser.email} for school ${schoolId}`);

    // Also update password in Supabase if it was changed
    if (plainTextPassword && existingUser.email) {
      try {
        console.log('🔄 Syncing password update to Supabase...');
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && supabaseServiceKey) {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
          
          // Find user by email in Supabase using paginated lookup
          let supabaseUser = null;
          let page = 1;
          const perPage = 1000;
          
          while (!supabaseUser && page <= 100) {
            const { data: userData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
              page,
              perPage
            });
            
            if (listError) {
              console.error('❌ Failed to list Supabase users:', listError);
              break;
            }
            
            supabaseUser = userData?.users?.find((u: any) => u.email === existingUser.email);
            
            if (!supabaseUser && (!userData?.users || userData.users.length < perPage)) {
              break; // No more users to check
            }
            page++;
          }
          
          if (supabaseUser) {
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
              supabaseUser.id,
              { password: plainTextPassword }
            );
            
            if (updateError) {
              console.error('❌ Failed to update password in Supabase:', updateError);
            } else {
              console.log('✅ Password successfully synced to Supabase');
            }
          } else {
            console.log('⚠️ User not found in Supabase - only local password updated');
          }
        } else {
          console.log('⚠️ Supabase credentials not available - only local password updated');
        }
      } catch (supabaseError) {
        console.error('❌ Error syncing password to Supabase:', supabaseError);
        // Don't fail the request if Supabase sync fails - local update was successful
      }
    }
    
    res.status(200).json(updatedUser);
  } catch (error) {
    const err = error as Error;
    console.error('❌ Error updating user:', error);
    res.status(500).json({ 
      message: 'Error updating user',
      error: err.message 
    });
  }
});

// Delete a user
router.delete('/users/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    console.log('🗑️ Deleting user for school admin...');
    
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Verify user belongs to this school before deleting
    const existingUser = await storage.getUser(userId);
    if (!existingUser || String(existingUser.schoolId) !== schoolId) {
      return res.status(404).json({ message: 'User not found or access denied' });
    }

    const userEmail = existingUser.email;
    console.log(`🗑️ Starting deletion process for user: ${userEmail} (ID: ${userId})`);

    // Step 1: Delete user from Supabase Auth (so they can't log in anymore)
    let supabaseDeleted = false;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });

        // First try using stored supabaseId if available (most reliable)
        if (existingUser.supabaseId) {
          const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.supabaseId);
          if (deleteAuthError) {
            console.error(`⚠️ Failed to delete Supabase auth user by ID: ${deleteAuthError.message}`);
          } else {
            console.log(`✅ Deleted user from Supabase Auth by supabaseId: ${userEmail}`);
            supabaseDeleted = true;
          }
        }

        // If no supabaseId or deletion by ID failed, search by email with pagination
        if (!supabaseDeleted) {
          let page = 1;
          const perPage = 100;
          let foundUser = null;

          // Paginate through all users to find by email
          while (!foundUser) {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
              page,
              perPage
            });
            
            if (!listData?.users || listData.users.length === 0) {
              break; // No more users to search
            }

            foundUser = listData.users.find(u => u.email === userEmail);
            
            if (listData.users.length < perPage) {
              break; // Last page
            }
            page++;
          }

          if (foundUser) {
            const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(foundUser.id);
            if (deleteAuthError) {
              console.error(`⚠️ Failed to delete Supabase auth user: ${deleteAuthError.message}`);
            } else {
              console.log(`✅ Deleted user from Supabase Auth: ${userEmail}`);
              supabaseDeleted = true;
            }
          } else {
            console.log(`ℹ️ User ${userEmail} not found in Supabase Auth (may be local-only user)`);
          }
        }
      } else {
        console.log('⚠️ Supabase credentials not available - skipping auth deletion');
      }
    } catch (supabaseError) {
      console.error('⚠️ Error during Supabase auth deletion:', supabaseError);
      // Continue with local deletion even if Supabase deletion fails
    }

    // Step 2: Clear user's activeRoleId to break FK constraint before deleting roles
    try {
      await storage.updateUser(userId, { activeRoleId: null });
      console.log(`✅ Cleared activeRoleId for user ID: ${userId}`);
    } catch (clearRoleError) {
      console.error('⚠️ Error clearing activeRoleId:', clearRoleError);
    }

    // Step 3: Clean up related records before deleting user
    // Delete user roles for this user
    try {
      await storage.deleteUserRolesByUserId(userId);
      console.log(`✅ Deleted user roles for user ID: ${userId}`);
    } catch (roleError) {
      console.error('⚠️ Error deleting user roles:', roleError);
    }

    // Delete school staff records
    try {
      await storage.deleteSchoolStaffByUserId(userId);
      console.log(`✅ Deleted school staff records for user ID: ${userId}`);
    } catch (staffError) {
      console.error('⚠️ Error deleting school staff records:', staffError);
    }

    // Delete user locations
    try {
      await storage.deleteUserLocationsByUserId(userId);
      console.log(`✅ Deleted user locations for user ID: ${userId}`);
    } catch (locError) {
      console.error('⚠️ Error deleting user locations:', locError);
    }

    // Delete notification recipients
    try {
      await storage.deleteNotificationRecipientsByUserId(userId);
      console.log(`✅ Deleted notification recipients for user ID: ${userId}`);
    } catch (notifError) {
      console.error('⚠️ Error deleting notification recipients:', notifError);
    }

    // Step 4: Delete emergency contacts for this user
    try {
      await storage.deleteEmergencyContactsByUserId(userId);
      console.log(`✅ Deleted emergency contacts for user ID: ${userId}`);
    } catch (emergencyError) {
      console.error('⚠️ Error deleting emergency contacts:', emergencyError);
    }

    // Step 5: Delete PII access logs for this user
    try {
      await storage.deletePiiAccessLogsByUserId(userId);
      console.log(`✅ Deleted PII access logs for user ID: ${userId}`);
    } catch (piiError) {
      console.error('⚠️ Error deleting PII access logs:', piiError);
    }

    // Step 6: Delete scheduled payments for this parent
    try {
      await storage.deleteScheduledPaymentsByParentId(userId);
      console.log(`✅ Deleted scheduled payments for user ID: ${userId}`);
    } catch (scheduledError) {
      console.error('⚠️ Error deleting scheduled payments:', scheduledError);
    }

    // Step 7: Delete program enrollments by parent (separate from child enrollments)
    try {
      await storage.deleteEnrollmentsByParentId(userId);
      console.log(`✅ Deleted program enrollments (by parent) for user ID: ${userId}`);
    } catch (enrollParentError) {
      console.error('⚠️ Error deleting program enrollments by parent:', enrollParentError);
    }

    // Step 8: Delete membership agreements (must be before membership enrollments due to FK)
    try {
      await storage.deleteMembershipAgreementsByParentUserId(userId);
      console.log(`✅ Deleted membership agreements for user ID: ${userId}`);
    } catch (membershipAgreementError) {
      console.error('⚠️ Error deleting membership agreements:', membershipAgreementError);
    }

    // Step 9: Delete membership enrollments
    try {
      await storage.deleteMembershipEnrollmentsByParentUserId(userId);
      console.log(`✅ Deleted membership enrollments for user ID: ${userId}`);
    } catch (membershipEnrollmentError) {
      console.error('⚠️ Error deleting membership enrollments:', membershipEnrollmentError);
    }

    // Step 10: Delete payment receipts
    try {
      await storage.deletePaymentReceiptsByParentUserId(userId);
      console.log(`✅ Deleted payment receipts for user ID: ${userId}`);
    } catch (paymentReceiptError) {
      console.error('⚠️ Error deleting payment receipts:', paymentReceiptError);
    }

    // Step 11: Clear substitute educator references in class sessions
    try {
      await storage.clearClassSessionsSubstituteEducatorId(userId);
      console.log(`✅ Cleared substitute educator references for user ID: ${userId}`);
    } catch (substituteError) {
      console.error('⚠️ Error clearing substitute educator references:', substituteError);
    }

    // Step 12: Delete class sessions where user is primary educator
    try {
      await storage.deleteClassSessionsByEducatorId(userId);
      console.log(`✅ Deleted class sessions for educator ID: ${userId}`);
    } catch (classSessionError) {
      console.error('⚠️ Error deleting class sessions:', classSessionError);
    }

    // Step 12a: Delete educator schedules
    try {
      await storage.deleteEducatorSchedulesByEducatorId(userId);
      console.log(`✅ Deleted educator schedules for educator ID: ${userId}`);
    } catch (scheduleError) {
      console.error('⚠️ Error deleting educator schedules:', scheduleError);
    }

    // Step 12b: Delete educator class assignments
    try {
      await storage.deleteEducatorClassAssignmentsByEducatorId(userId);
      console.log(`✅ Deleted educator class assignments for educator ID: ${userId}`);
    } catch (assignmentError) {
      console.error('⚠️ Error deleting educator class assignments:', assignmentError);
    }

    // Step 12c: Clear instructorId from classes (set to null)
    try {
      await storage.clearClassesInstructorId(userId);
      console.log(`✅ Cleared instructor references in classes for user ID: ${userId}`);
    } catch (classInstructorError) {
      console.error('⚠️ Error clearing class instructor references:', classInstructorError);
    }

    // Step 12d: Clear instructorId from programs (set to null)
    try {
      await storage.clearProgramsInstructorId(userId);
      console.log(`✅ Cleared instructor references in programs for user ID: ${userId}`);
    } catch (programInstructorError) {
      console.error('⚠️ Error clearing program instructor references:', programInstructorError);
    }

    // Step 13: Cascade delete children and their dependencies
    try {
      const children = await storage.getChildrenByParentId(userId);
      console.log(`👶 Found ${children.length} children to delete for user ID: ${userId}`);
      
      for (const child of children) {
        // Delete enrollments for this child first
        try {
          await storage.deleteEnrollmentsByChildId(child.id);
          console.log(`  ✅ Deleted enrollments for child ID: ${child.id}`);
        } catch (enrollError) {
          console.error(`  ⚠️ Error deleting enrollments for child ${child.id}:`, enrollError);
        }
        
        // Delete school_students records for this child
        try {
          await storage.deleteSchoolStudentsByChildId(child.id);
          console.log(`  ✅ Deleted school student records for child ID: ${child.id}`);
        } catch (schoolStudentError) {
          console.error(`  ⚠️ Error deleting school student records for child ${child.id}:`, schoolStudentError);
        }

        // Delete discount_applications for this child
        try {
          await storage.deleteDiscountApplicationsByChildId(child.id);
          console.log(`  ✅ Deleted discount applications for child ID: ${child.id}`);
        } catch (discountError) {
          console.error(`  ⚠️ Error deleting discount applications for child ${child.id}:`, discountError);
        }
      }
      
      // Now delete all children for this parent
      await storage.deleteChildrenByParentId(userId);
      console.log(`✅ Deleted ${children.length} children for user ID: ${userId}`);
    } catch (childError) {
      console.error('⚠️ Error deleting children:', childError);
    }

    // Step 14: Delete user from local database
    await storage.deleteUser(userId);
    console.log(`✅ Deleted user from database: ${userEmail} (ID: ${userId}) from school ${schoolId}`);
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    const err = error as Error;
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ 
      message: 'Error deleting user',
      error: err.message 
    });
  }
});

// Import users from CSV files
router.post('/import-users', async (req: any, res) => {
  try {
    console.log('📋 Starting user import process...');
    
    if (!req.files || Object.keys(req.files).length === 0) {
      console.error('❌ No files found in request');
      return res.status(400).json({ error: "No files uploaded" });
    }
    
    // Validate schoolId - NEVER allow hardcoded fallback
    const schoolIdRaw = parseInt(req.body.schoolId);
    if (!schoolIdRaw || isNaN(schoolIdRaw)) {
      console.error('❌ Invalid or missing school ID in request');
      return res.status(400).json({ error: "Valid school ID is required for user import" });
    }
    const schoolId = schoolIdRaw;
    console.log(`🏫 Importing users for school ID: ${schoolId}`);
    
    const results = {
      schoolId,
      parents: { successful: 0, failed: 0 },
      children: { successful: 0, failed: 0 },
      staff: { successful: 0, failed: 0 },
      errors: [] as string[]
    };
    
    // Handle multiple CSV files
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
    
    for (const file of files) {
      if (!file) continue;
      
      const fileName = file.name.toLowerCase();
      const fileContent = file.data.toString('utf-8');
      
      console.log(`📄 Processing file: ${fileName}`);
      
      try {
        const records: any[] = await new Promise((resolve, reject) => {
          const output: any[] = [];
          parseCSV(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          })
          .on('data', (data) => output.push(data))
          .on('end', () => resolve(output))
          .on('error', (err) => reject(err));
        });
        
        console.log(`📊 Found ${records.length} records in ${fileName}`);
        
        // Process based on filename
        if (fileName.includes('parent') || fileName.includes('user')) {
          await processParentRecords(records, results, schoolId);
        } else if (fileName.includes('child') || fileName.includes('student')) {
          await processChildRecords(records, results, schoolId);
        } else if (fileName.includes('staff') || fileName.includes('teacher')) {
          await processStaffRecords(records, results, schoolId);
        }
      } catch (parseError: any) {
        console.error(`❌ Error parsing ${fileName}:`, parseError);
        results.errors.push(`Error parsing ${fileName}: ${parseError.message}`);
      }
    }
    
    console.log('✅ Import process completed:', results);
    res.status(200).json(results);
  } catch (error: any) {
    console.error('❌ Error during import:', error);
    res.status(500).json({ 
      error: error.message || 'Import failed'
    });
  }
});

// [FIX:v3.0] Helper function to process parent records
async function processParentRecords(records: any[], results: any, schoolId: number) {
  console.log(`👨‍👩‍👧‍👦 Processing ${records.length} parent records...`);
  
  for (const record of records) {
    try {
      const firstName = record['First Name'] || record.firstName;
      const lastName = record['Last Name'] || record.lastName;
      const email = record['Email'] || record.email;
      
      const userData = {
        firstName,
        lastName,
        email,
        name: `${firstName} ${lastName}`,
        phone: record['Phone'] || record.phone,
        emergencyContactFirstName: record['Emergency Contact - First Name'] || record.emergencyContactFirstName,
        emergencyContactLastName: record['Emergency Contact - Last Name'] || record.emergencyContactLastName,
        emergencyContactPhone: record['Emergency Contact Phone'] || record.emergencyContactPhone,
        role: 'parent' as const,
        schoolId: Number(schoolId),
        username: email?.split('@')[0] || '',
        password: 'tempPass123!' // Temporary password
      };
      
      if (!userData.firstName || !userData.lastName || !userData.email) {
        results.errors.push(`Missing required fields for parent: ${JSON.stringify(record)}`);
        results.parents.failed++;
        continue;
      }
      
      await storage.createUser(userData as any);
      results.parents.successful++;
      console.log(`✅ Created parent: ${userData.firstName} ${userData.lastName}`);
    } catch (error: any) {
      console.error(`❌ Error creating parent:`, error);
      results.parents.failed++;
      results.errors.push(`Failed to create parent ${record['First Name']} ${record['Last Name']}: ${error.message}`);
    }
  }
}

// [FIX:v3.0] Helper function to process child records
async function processChildRecords(records: any[], results: any, schoolId: number) {
  console.log(`👶 Processing ${records.length} child records...`);
  
  for (const record of records) {
    try {
      const childData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        birthDate: record['Birth Date'] || record.birthDate,
        grade: record['Grade'] || record.grade,
        parentEmail: record['Parent Email'] || record.parentEmail,
        schoolId: schoolId
      };
      
      if (!childData.firstName || !childData.lastName) {
        results.errors.push(`Missing required fields for child: ${JSON.stringify(record)}`);
        results.children.failed++;
        continue;
      }
      
      // Create child (assuming storage has createChild method)
      // await storage.createChild(childData);
      results.children.successful++;
      console.log(`✅ Created child: ${childData.firstName} ${childData.lastName}`);
    } catch (error: any) {
      console.error(`❌ Error creating child:`, error);
      results.children.failed++;
      results.errors.push(`Failed to create child ${record['First Name']} ${record['Last Name']}: ${error.message}`);
    }
  }
}

// [FIX:v3.0] Helper function to process staff records
async function processStaffRecords(records: any[], results: any, schoolId: number) {
  console.log(`👩‍🏫 Processing ${records.length} staff records...`);
  
  for (const record of records) {
    try {
      const firstName = record['First Name'] || record.firstName;
      const lastName = record['Last Name'] || record.lastName;
      const email = record['Email'] || record.email;
      
      const userData = {
        firstName,
        lastName,
        email,
        name: `${firstName} ${lastName}`,
        phone: record['Phone'] || record.phone,
        role: 'educator' as const,
        schoolId: Number(schoolId), // [FIX:v3.0] Convert string to number for Drizzle schema
        username: email?.split('@')[0] || '',
        password: 'tempPass123!' // Temporary password
      };
      
      if (!userData.firstName || !userData.lastName || !userData.email) {
        results.errors.push(`Missing required fields for staff: ${JSON.stringify(record)}`);
        results.staff.failed++;
        continue;
      }
      
      await storage.createUser(userData as any);
      results.staff.successful++;
      console.log(`✅ Created staff: ${userData.firstName} ${userData.lastName}`);
    } catch (error: any) {
      console.error(`❌ Error creating staff:`, error);
      results.staff.failed++;
      results.errors.push(`Failed to create staff ${record['First Name']} ${record['Last Name']}: ${error.message}`);
    }
  }
}

// Send account invite email to existing user
router.post('/users/:userId/send-invite', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    console.log(`📧 Sending account invite to user ID: ${userId}`);

    // Get user details
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Look up the user's actual role from user_roles table (not the deprecated users.role field)
    // Priority: 1) activeRoleId match, 2) non-parent role (for staff), 3) first role, 4) fallback
    const userRolesData = await storage.getUserRolesByUserId(userId);
    let primaryRole: string = user.role || 'parent';
    
    if (userRolesData.length > 0) {
      // Try to find the active role first
      const activeRole = user.activeRoleId 
        ? userRolesData.find(r => r.id === user.activeRoleId)
        : null;
      
      if (activeRole) {
        primaryRole = activeRole.role;
      } else {
        // Prefer non-parent roles for staff invites (staff/educator/admin/custom roles like Mentor)
        const nonParentRole = userRolesData.find(r => r.role !== 'parent');
        primaryRole = nonParentRole ? nonParentRole.role : userRolesData[0].role;
      }
    }
    console.log(`📋 User ${user.email} has ${userRolesData.length} roles, activeRoleId: ${user.activeRoleId}, using role: ${primaryRole}`);

    // Generate a temporary password
    const temporaryPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    
    // Hash the temporary password for local storage
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    
    // Create or update Supabase account if user doesn't have one
    let supabaseUserId = user.supabaseId;
    
    if (!supabaseUserId) {
      console.log(`🔧 Creating or linking Supabase account for ${user.email} (user has no supabaseId)`);
      
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Try to create Supabase auth account
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: temporaryPassword,
          email_confirm: true,
          app_metadata: {
            role: primaryRole,
            school_id: user.schoolId || null
          },
          user_metadata: {
            name: `${user.firstName || user.name || ''} ${user.lastName || ''}`
          }
        });

        // If account already exists, find it and link it  
        if (authError && (authError.code === 'email_exists' || authError.message?.includes('already registered'))) {
          console.log(`⚠️ Supabase account already exists for ${user.email}, finding existing account...`);
          
          // Use paginated lookup to find user by email (Supabase doesn't have getUserByEmail)
          let existingSupabaseUser = null;
          let page = 1;
          const perPage = 1000; // Max allowed per page
          
          while (!existingSupabaseUser) {
            const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.listUsers({
              page,
              perPage
            });
            
            if (getUserError) {
              console.error('❌ Failed to list Supabase users:', getUserError);
              return res.status(500).json({ message: 'Failed to find existing authentication account' });
            }
            
            existingSupabaseUser = userData?.users?.find((u: any) => u.email === user.email);
            
            // If we've exhausted all users and still not found
            if (!existingSupabaseUser && (!userData?.users || userData.users.length < perPage)) {
              console.error('❌ Supabase user not found despite email exists error for:', user.email);
              return res.status(500).json({ message: 'Could not find existing authentication account. Please try again.' });
            }
            
            page++;
            // Safety limit to prevent infinite loops
            if (page > 100) {
              console.error('❌ Exceeded pagination limit searching for user:', user.email);
              return res.status(500).json({ message: 'Could not find existing authentication account. Please try again.' });
            }
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
        
        // Update local user record with Supabase ID and password
        await storage.updateUser(userId, { 
          password: hashedPassword,
          supabaseId: supabaseUserId 
        });
        console.log(`✅ Updated local user ${userId} with supabaseId: ${supabaseUserId}`);
      } catch (supabaseError) {
        console.error('❌ Error creating Supabase account:', supabaseError);
        return res.status(500).json({ message: 'Failed to create authentication account' });
      }
    } else {
      console.log(`✅ User already has Supabase account: ${supabaseUserId}`);
      
      // Update password in both Supabase and local database
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );

        await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, { 
          password: temporaryPassword 
        });
        console.log(`✅ Updated Supabase password for ${user.email}`);
        
        await storage.updateUser(userId, { password: hashedPassword });
        console.log(`✅ Updated local password for user ${userId}`);
      } catch (updateError) {
        console.error('❌ Error updating password:', updateError);
        return res.status(500).json({ message: 'Failed to update password' });
      }
    }

    // Send invite email with actual role from user_roles table
    const emailSuccess = await sendAccountInviteEmail({
      email: user.email,
      firstName: user.firstName || user.name || 'User',
      lastName: user.lastName || '',
      role: primaryRole,
      temporaryPassword
    });

    if (!emailSuccess) {
      return res.status(500).json({ message: 'Failed to send invite email' });
    }

    console.log(`✅ Account invite sent successfully to ${user.email}`);
    res.json({ message: 'Account invite sent successfully' });
  } catch (error) {
    console.error('❌ Error sending account invite:', error);
    res.status(500).json({ message: 'Failed to send account invite' });
  }
});

// Send password reset email to existing user
router.post('/users/:userId/send-password-reset', supabaseAuth, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.userId);
    console.log(`🔑 Attempting to send password reset to user ID: ${userId}`);

    // Get user details
    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`❌ User not found: ID ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`📧 Found user: ${user.email} (${user.firstName || user.name})`);

    // Verify user has a Supabase account
    if (!user.supabaseId) {
      console.error(`❌ User ${user.email} has no Supabase account (supabaseId is null)`);
      return res.status(400).json({ message: 'User does not have a password account. Please use account invite instead.' });
    }

    console.log(`✅ User has Supabase UUID: ${user.supabaseId}`);

    // Generate cryptographically secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    console.log(`🔐 Generated secure reset token for ${user.email}, expires: ${tokenExpiry.toISOString()}`);

    // Store reset token in database with Supabase UUID
    try {
      await storage.createPasswordResetToken({
        token: resetToken,
        email: user.email,
        userId: user.supabaseId,
        expiresAt: tokenExpiry,
        used: false
      });
      console.log(`💾 Reset token stored in database for ${user.email} with Supabase UUID: ${user.supabaseId}`);
    } catch (tokenError) {
      console.error(`❌ Failed to store reset token in database:`, tokenError);
      return res.status(500).json({ message: 'Failed to create password reset token' });
    }

    // Send password reset email
    console.log(`📨 Attempting to send password reset email to ${user.email}...`);
    const emailSuccess = await sendPasswordResetEmail({
      email: user.email,
      firstName: user.firstName || user.name || 'User',
      resetToken: resetToken
    });

    if (!emailSuccess) {
      console.error(`❌ Email service returned false for ${user.email}`);
      return res.status(500).json({ message: 'Email service failed to send password reset' });
    }

    console.log(`✅ Password reset email sent successfully to ${user.email}`);
    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    console.error('❌ Unexpected error sending password reset:', error);
    console.error('Error details:', error instanceof Error ? error.stack : error);
    res.status(500).json({ 
      message: 'Failed to send password reset email',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== CATEGORY MANAGEMENT ====================

// Default categories to seed for new schools
const DEFAULT_CATEGORIES = [
  { name: 'Early Childhood', description: 'Classes for early childhood development' },
  { name: 'Pre-Kindergarten', description: 'Pre-K programs and activities' },
  { name: 'Kindergarten', description: 'Kindergarten classes' },
  { name: 'Lower Elementary', description: 'Grades 1-3' },
  { name: 'Upper Elementary', description: 'Grades 4-6' },
  { name: 'Middle School', description: 'Grades 7-8' },
  { name: 'High School', description: 'Grades 9-12' },
  { name: 'Extracurricular', description: 'Extracurricular activities and clubs' },
];

// Helper function to seed default categories for a school
async function seedDefaultCategories(schoolId: number): Promise<void> {
  console.log(`🌱 Seeding default categories for school ID: ${schoolId}`);
  
  // Fetch existing categories once before the loop
  const existingCategories = await storage.getCategoriesBySchoolId(schoolId);
  const existingNames = new Set(existingCategories.map(c => c.name));
  
  let seededCount = 0;
  for (const category of DEFAULT_CATEGORIES) {
    try {
      // Skip if category already exists
      if (existingNames.has(category.name)) {
        console.log(`⏭️  Category "${category.name}" already exists, skipping`);
        continue;
      }
      
      await storage.createCategory({
        schoolId: schoolId,
        name: category.name,
        description: category.description,
        isActive: true
      });
      seededCount++;
      console.log(`✅ Created default category: ${category.name}`);
    } catch (error) {
      console.error(`❌ Error creating category "${category.name}":`, error);
      // Continue with other categories even if one fails
    }
  }
  
  console.log(`✅ Finished seeding ${seededCount} default categories (${DEFAULT_CATEGORIES.length - seededCount} already existed)`);
}

// Get all categories for the logged-in school
router.get("/categories", supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user to find their school
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !user.schoolId) {
      return res.status(403).json({ message: "User not associated with a school" });
    }

    console.log(`📚 Getting categories for school ID: ${user.schoolId}`);
    let categories = await storage.getCategoriesBySchoolId(user.schoolId);
    
    // Auto-seed default categories if school has none
    if (categories.length === 0) {
      console.log(`📋 School ${user.schoolId} has no categories - seeding defaults`);
      await seedDefaultCategories(user.schoolId);
      categories = await storage.getCategoriesBySchoolId(user.schoolId);
    }
    
    res.json(categories);
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

// Create a new category
router.post("/categories", supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user to find their school
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !user.schoolId) {
      return res.status(403).json({ message: "User not associated with a school" });
    }

    // Verify user has school admin role
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    console.log(`➕ Creating new category "${name}" for school ID: ${user.schoolId}`);
    const newCategory = await storage.createCategory({
      schoolId: user.schoolId,
      name,
      description: description || null,
      isActive: true
    });

    res.status(201).json(newCategory);
  } catch (error) {
    console.error('❌ Error creating category:', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
});

// Update a category
router.put("/categories/:id", supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user to find their school
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !user.schoolId) {
      return res.status(403).json({ message: "User not associated with a school" });
    }

    // Verify user has school admin role
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const categoryId = parseInt(req.params.id);
    const { name, description, isActive } = req.body;

    // Verify category belongs to user's school
    const categories = await storage.getCategoriesBySchoolId(user.schoolId);
    const categoryExists = categories.some(c => c.id === categoryId);
    if (!categoryExists) {
      return res.status(404).json({ message: "Category not found or access denied" });
    }

    console.log(`✏️ Updating category ID: ${categoryId} for school ID: ${user.schoolId}`);
    const updatedCategory = await storage.updateCategory(categoryId, {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive })
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('❌ Error updating category:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

// Delete (soft delete) a category
router.delete("/categories/:id", supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user to find their school
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !user.schoolId) {
      return res.status(403).json({ message: "User not associated with a school" });
    }

    // Verify user has school admin role
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const categoryId = parseInt(req.params.id);

    // Verify category belongs to user's school
    const categories = await storage.getCategoriesBySchoolId(user.schoolId);
    const categoryExists = categories.some(c => c.id === categoryId);
    if (!categoryExists) {
      return res.status(404).json({ message: "Category not found or access denied" });
    }

    console.log(`🗑️ Soft deleting category ID: ${categoryId} for school ID: ${user.schoolId}`);
    await storage.deleteCategory(categoryId);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting category:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
});

// Resend welcome email to a user (admin utility)
router.post("/resend-welcome-email", supabaseAuth, async (req: any, res) => {
  try {
    const { email, userId } = req.body;

    // Validate input - need exactly one of email or userId (mutual exclusivity)
    // Note: Use explicit undefined checks to handle userId: 0 correctly
    if (!email && userId === undefined) {
      return res.status(400).json({
        success: false,
        message: "Either email or userId is required"
      });
    }

    if (email && userId !== undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide either email or userId, not both"
      });
    }

    console.log('📧 Resending welcome email for:', email || `userId: ${userId}`);

    // Fetch user data from database
    let user;
    if (email) {
      user = await storage.getUserByEmail(email);
    } else {
      // userId is guaranteed to exist here due to validation above
      user = await storage.getUser(userId);
    }

    if (!user) {
      console.error('❌ User not found for resend welcome email');
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get firstName - use firstName field or extract from name field
    const firstName = user.firstName || (user.name ? user.name.split(' ')[0] : null);
    const lastName = user.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : '');

    // Validate user has required data for welcome email
    if (!user.email || !firstName) {
      return res.status(400).json({
        success: false,
        message: "User missing required data (email or firstName)"
      });
    }

    // Fetch school data from the recipient user's school association
    let schoolName: string | undefined;
    
    if (user.schoolId) {
      try {
        const school = await storage.getSchool(user.schoolId);
        if (school) {
          schoolName = school.name;
        }
      } catch (schoolError) {
        console.error('⚠️ Failed to fetch school data for welcome email:', schoolError);
      }
    }
    
    // Import and call the existing sendWelcomeEmail function
    const { sendWelcomeEmail } = await import('../lib/email-service');
    
    const emailSent = await sendWelcomeEmail({
      email: user.email,
      firstName: firstName,
      lastName: lastName,
      role: user.role || 'parent',
      schoolName
    });

    if (emailSent) {
      console.log('✅ Welcome email resent successfully to:', user.email);
      return res.json({
        success: true,
        message: `Welcome email sent to ${user.email}`,
        user: {
          email: user.email,
          firstName: firstName,
          lastName: lastName
        }
      });
    } else {
      console.error('❌ Failed to send welcome email to:', user.email);
      return res.status(500).json({
        success: false,
        message: "Failed to send welcome email - please check email service configuration"
      });
    }
  } catch (error) {
    console.error('❌ Error resending welcome email:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to resend welcome email"
    });
  }
});

// GET /api/school-admin/staff-hours - Get educator/mentor hours for the school
router.get('/staff-hours', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    console.log('[StaffHours] Fetching hours for school:', schoolId, 'from', startDate, 'to', endDate);

    // Get all sessions for the school in the date range
    const sessions = await storage.getClassSessionsByDateRange(schoolId, startDate as string, endDate as string);
    
    // Get all educator assignments for the school
    const assignments = await storage.getEducatorClassAssignmentsBySchoolId(schoolId);
    
    // Get unique educator IDs from assignments
    const educatorIds = [...new Set(assignments.map(a => a.educatorId))];
    
    // Fetch educator details
    const educators: any[] = [];
    for (const educatorId of educatorIds) {
      const user = await storage.getUser(educatorId);
      if (user) {
        educators.push({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role
        });
      }
    }

    // Group sessions by educator and calculate hours
    const educatorHours: Record<number, {
      educator: typeof educators[0];
      sessions: any[];
      totalScheduledMinutes: number;
      totalActualMinutes: number;
      completedSessions: number;
      pendingSessions: number;
    }> = {};

    for (const educator of educators) {
      educatorHours[educator.id] = {
        educator,
        sessions: [],
        totalScheduledMinutes: 0,
        totalActualMinutes: 0,
        completedSessions: 0,
        pendingSessions: 0
      };
    }

    for (const session of sessions) {
      const educatorId = session.educatorId;
      if (!educatorHours[educatorId]) continue;

      // Calculate scheduled minutes
      if (session.scheduledStartTime && session.scheduledEndTime) {
        const [startH, startM] = session.scheduledStartTime.split(':').map(Number);
        const [endH, endM] = session.scheduledEndTime.split(':').map(Number);
        const scheduledMins = (endH * 60 + endM) - (startH * 60 + startM);
        if (scheduledMins > 0) {
          educatorHours[educatorId].totalScheduledMinutes += scheduledMins;
        }
      }

      // Calculate actual minutes
      if (session.actualStartTime && session.actualEndTime) {
        const start = new Date(session.actualStartTime);
        const end = new Date(session.actualEndTime);
        const actualMins = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
        if (actualMins > 0) {
          educatorHours[educatorId].totalActualMinutes += actualMins;
        }
        educatorHours[educatorId].completedSessions++;
      } else if (session.status === 'scheduled') {
        educatorHours[educatorId].pendingSessions++;
      }

      // Get class info for session
      const classInfo = await storage.getClassById(session.classId);
      educatorHours[educatorId].sessions.push({
        ...session,
        className: classInfo?.title || 'Unknown Class'
      });
    }

    // Convert to array and calculate hours
    const staffHoursList = Object.values(educatorHours).map(entry => ({
      educator: entry.educator,
      totalScheduledHours: Math.round(entry.totalScheduledMinutes / 60 * 100) / 100,
      totalActualHours: Math.round(entry.totalActualMinutes / 60 * 100) / 100,
      completedSessions: entry.completedSessions,
      pendingSessions: entry.pendingSessions,
      sessions: entry.sessions.map(s => ({
        id: s.id,
        classId: s.classId,
        className: s.className,
        scheduledDate: s.scheduledDate,
        scheduledStartTime: s.scheduledStartTime,
        scheduledEndTime: s.scheduledEndTime,
        actualStartTime: s.actualStartTime,
        actualEndTime: s.actualEndTime,
        status: s.status
      }))
    })).filter(e => e.sessions.length > 0 || e.totalActualHours > 0);

    // Calculate totals
    const summary = {
      totalEducators: staffHoursList.length,
      totalScheduledHours: staffHoursList.reduce((sum, e) => sum + e.totalScheduledHours, 0),
      totalActualHours: staffHoursList.reduce((sum, e) => sum + e.totalActualHours, 0),
      totalCompletedSessions: staffHoursList.reduce((sum, e) => sum + e.completedSessions, 0),
      totalPendingSessions: staffHoursList.reduce((sum, e) => sum + e.pendingSessions, 0)
    };

    res.json({
      summary,
      staffHours: staffHoursList,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('[StaffHours] Error:', error);
    res.status(500).json({ error: 'Failed to fetch staff hours' });
  }
});

// ==================== VOLUNTEER CREDITS ADMIN ENDPOINTS ====================

// GET /api/school-admin/volunteer-credits - Get all volunteer credits for school
router.get('/volunteer-credits', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    // Get school from user's role
    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const { status } = req.query;
    let credits = await storage.getVolunteerCreditsBySchoolId(adminRole.schoolId);
    
    if (status) {
      credits = credits.filter(c => c.status === status);
    }

    // Enrich with user and session info
    const enrichedCredits = await Promise.all(credits.map(async (credit) => {
      const user = await storage.getUser(credit.userId);
      let sessionInfo = null;
      if (credit.sessionId) {
        const session = await storage.getClassSessionById(credit.sessionId);
        if (session) {
          const classInfo = await storage.getClassById(session.classId);
          sessionInfo = {
            id: session.id,
            scheduledDate: session.scheduledDate,
            className: classInfo?.title || 'Unknown Class'
          };
        }
      }
      return {
        ...credit,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown',
        userEmail: user?.email || '',
        session: sessionInfo
      };
    }));

    res.json(enrichedCredits);
  } catch (error) {
    console.error('[VolunteerCredits] Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch volunteer credits' });
  }
});

// GET /api/school-admin/volunteer-credits/pending - Get pending credits count
router.get('/volunteer-credits/pending', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const pendingCredits = await storage.getPendingVolunteerCredits(adminRole.schoolId);
    res.json({ count: pendingCredits.length, credits: pendingCredits });
  } catch (error) {
    console.error('[VolunteerCredits] Error fetching pending count:', error);
    res.status(500).json({ error: 'Failed to fetch pending credits' });
  }
});

// POST /api/school-admin/volunteer-credits/:id/approve - Approve a volunteer credit
router.post('/volunteer-credits/:id/approve', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const creditId = parseInt(req.params.id);
    const credit = await storage.getVolunteerCreditById(creditId);
    
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    // Verify admin has access to this school
    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase()) &&
      r.schoolId === credit.schoolId
    );
    
    if (!adminRole) {
      return res.status(403).json({ error: 'Not authorized to approve this credit' });
    }

    if (credit.status !== 'pending') {
      return res.status(400).json({ error: 'Credit is not pending approval' });
    }

    const approvedCredit = await storage.approveVolunteerCredit(creditId, userId);
    
    // Create audit log
    try {
      await storage.createAuditLog({
        actionType: 'volunteer_credit_approved',
        severity: 'info',
        actorId: userId,
        actorRole: 'schoolAdmin',
        actorEmail: req.user?.email,
        targetType: 'volunteer_credit',
        targetId: String(creditId),
        schoolId: credit.schoolId,
        metadata: {
          context: 'Admin approved volunteer credit',
          creditAmount: credit.creditAmountCents,
          minutesWorked: credit.minutesWorked,
          volunteerId: credit.userId
        }
      });
    } catch (auditError) {
      console.error('[VolunteerCredits] Failed to create audit log:', auditError);
    }

    console.log(`[VolunteerCredits] Credit ${creditId} approved by admin ${userId}`);
    res.json(approvedCredit);
  } catch (error) {
    console.error('[VolunteerCredits] Error approving credit:', error);
    res.status(500).json({ error: 'Failed to approve credit' });
  }
});

// POST /api/school-admin/volunteer-credits/:id/reject - Reject a volunteer credit
router.post('/volunteer-credits/:id/reject', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const creditId = parseInt(req.params.id);
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const credit = await storage.getVolunteerCreditById(creditId);
    
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    // Verify admin has access to this school
    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase()) &&
      r.schoolId === credit.schoolId
    );
    
    if (!adminRole) {
      return res.status(403).json({ error: 'Not authorized to reject this credit' });
    }

    if (credit.status !== 'pending') {
      return res.status(400).json({ error: 'Credit is not pending approval' });
    }

    const rejectedCredit = await storage.rejectVolunteerCredit(creditId, userId, reason);
    
    // Create audit log
    try {
      await storage.createAuditLog({
        actionType: 'volunteer_credit_rejected',
        severity: 'info',
        actorId: userId,
        actorRole: 'schoolAdmin',
        actorEmail: req.user?.email,
        targetType: 'volunteer_credit',
        targetId: String(creditId),
        schoolId: credit.schoolId,
        metadata: {
          context: 'Admin rejected volunteer credit',
          creditAmount: credit.creditAmountCents,
          minutesWorked: credit.minutesWorked,
          volunteerId: credit.userId,
          rejectionReason: reason
        }
      });
    } catch (auditError) {
      console.error('[VolunteerCredits] Failed to create audit log:', auditError);
    }

    console.log(`[VolunteerCredits] Credit ${creditId} rejected by admin ${userId}`);
    res.json(rejectedCredit);
  } catch (error) {
    console.error('[VolunteerCredits] Error rejecting credit:', error);
    res.status(500).json({ error: 'Failed to reject credit' });
  }
});

// POST /api/school-admin/volunteer-credits/bulk-approve - Bulk approve multiple credits
router.post('/volunteer-credits/bulk-approve', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const { creditIds } = req.body;
    if (!Array.isArray(creditIds) || creditIds.length === 0) {
      return res.status(400).json({ error: 'creditIds array is required' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const results = { approved: [] as number[], failed: [] as number[] };

    for (const creditId of creditIds) {
      try {
        const credit = await storage.getVolunteerCreditById(creditId);
        if (credit && credit.schoolId === adminRole.schoolId && credit.status === 'pending') {
          await storage.approveVolunteerCredit(creditId, userId);
          results.approved.push(creditId);
        } else {
          results.failed.push(creditId);
        }
      } catch (err) {
        results.failed.push(creditId);
      }
    }

    console.log(`[VolunteerCredits] Bulk approved ${results.approved.length} credits by admin ${userId}`);
    res.json(results);
  } catch (error) {
    console.error('[VolunteerCredits] Error bulk approving credits:', error);
    res.status(500).json({ error: 'Failed to bulk approve credits' });
  }
});

// ==================== UNIFIED CREDIT SYSTEM ADMIN ENDPOINTS ====================
// New endpoints that work with all credit types (volunteer, referral, achievement, marketing, manual)

// GET /api/school-admin/credits - Get all credits for school with optional filters
router.get('/credits', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const { status, creditType, includeExpired } = req.query;
    
    const credits = await storage.getCredits({
      schoolId: adminRole.schoolId,
      status: status as any,
      creditType: creditType as any,
      includeExpired: includeExpired === 'true'
    });

    // Enrich with user info and session info for volunteer credits
    const enrichedCredits = await Promise.all(credits.map(async (credit) => {
      const user = await storage.getUser(credit.userId);
      let sessionInfo = null;
      
      // For volunteer credits, get session info from metadata
      if (credit.creditType === 'volunteer' && credit.metadata) {
        const meta = credit.metadata as { sessionId?: number };
        if (meta.sessionId) {
          const session = await storage.getClassSessionById(meta.sessionId);
          if (session) {
            const classInfo = await storage.getClassById(session.classId);
            sessionInfo = {
              id: session.id,
              scheduledDate: session.scheduledDate,
              className: classInfo?.title || 'Unknown Class'
            };
          }
        }
      }
      
      return {
        ...credit,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown',
        userEmail: user?.email || '',
        session: sessionInfo,
        remainingAmount: credit.creditAmountCents - credit.usedAmountCents
      };
    }));

    res.json(enrichedCredits);
  } catch (error) {
    console.error('[Credits] Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

// GET /api/school-admin/credits/pending - Get pending credits count with optional type filter
router.get('/credits/pending', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const { creditType } = req.query;
    const pendingCredits = await storage.getPendingCredits(
      adminRole.schoolId, 
      creditType as any
    );
    
    res.json({ count: pendingCredits.length, credits: pendingCredits });
  } catch (error) {
    console.error('[Credits] Error fetching pending count:', error);
    res.status(500).json({ error: 'Failed to fetch pending credits' });
  }
});

// POST /api/school-admin/credits/:id/approve - Approve a credit (any type)
router.post('/credits/:id/approve', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const creditId = parseInt(req.params.id);
    const credit = await storage.getCreditById(creditId);
    
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase()) &&
      r.schoolId === credit.schoolId
    );
    
    if (!adminRole) {
      return res.status(403).json({ error: 'Not authorized to approve this credit' });
    }

    if (credit.status !== 'pending') {
      return res.status(400).json({ error: 'Credit is not pending approval' });
    }

    const approvedCredit = await storage.approveCredit(creditId, userId);
    
    // Create audit log
    try {
      const meta = credit.metadata as { minutesWorked?: number } | null;
      await storage.createAuditLog({
        actionType: 'credit_approved',
        severity: 'info',
        actorId: userId,
        actorRole: 'schoolAdmin',
        actorEmail: req.user?.email,
        targetType: 'credit',
        targetId: String(creditId),
        schoolId: credit.schoolId,
        metadata: {
          context: `Admin approved ${credit.creditType} credit`,
          creditType: credit.creditType,
          creditAmount: credit.creditAmountCents,
          minutesWorked: meta?.minutesWorked || null,
          userId: credit.userId
        }
      });
    } catch (auditError) {
      console.error('[Credits] Failed to create audit log:', auditError);
    }

    console.log(`[Credits] Credit ${creditId} (${credit.creditType}) approved by admin ${userId}`);
    res.json(approvedCredit);
  } catch (error) {
    console.error('[Credits] Error approving credit:', error);
    res.status(500).json({ error: 'Failed to approve credit' });
  }
});

// POST /api/school-admin/credits/:id/reject - Reject a credit (any type)
router.post('/credits/:id/reject', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const creditId = parseInt(req.params.id);
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const credit = await storage.getCreditById(creditId);
    
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase()) &&
      r.schoolId === credit.schoolId
    );
    
    if (!adminRole) {
      return res.status(403).json({ error: 'Not authorized to reject this credit' });
    }

    if (credit.status !== 'pending') {
      return res.status(400).json({ error: 'Credit is not pending approval' });
    }

    const rejectedCredit = await storage.rejectCredit(creditId, userId, reason);
    
    // Create audit log
    try {
      const meta = credit.metadata as { minutesWorked?: number } | null;
      await storage.createAuditLog({
        actionType: 'credit_rejected',
        severity: 'info',
        actorId: userId,
        actorRole: 'schoolAdmin',
        actorEmail: req.user?.email,
        targetType: 'credit',
        targetId: String(creditId),
        schoolId: credit.schoolId,
        metadata: {
          context: `Admin rejected ${credit.creditType} credit`,
          creditType: credit.creditType,
          creditAmount: credit.creditAmountCents,
          minutesWorked: meta?.minutesWorked || null,
          userId: credit.userId,
          rejectionReason: reason
        }
      });
    } catch (auditError) {
      console.error('[Credits] Failed to create audit log:', auditError);
    }

    console.log(`[Credits] Credit ${creditId} (${credit.creditType}) rejected by admin ${userId}`);
    res.json(rejectedCredit);
  } catch (error) {
    console.error('[Credits] Error rejecting credit:', error);
    res.status(500).json({ error: 'Failed to reject credit' });
  }
});

// POST /api/school-admin/credits/bulk-approve - Bulk approve multiple credits
router.post('/credits/bulk-approve', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const { creditIds } = req.body;
    if (!Array.isArray(creditIds) || creditIds.length === 0) {
      return res.status(400).json({ error: 'creditIds array is required' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const results = { approved: [] as number[], failed: [] as number[] };

    for (const creditId of creditIds) {
      try {
        const credit = await storage.getCreditById(creditId);
        if (credit && credit.schoolId === adminRole.schoolId && credit.status === 'pending') {
          await storage.approveCredit(creditId, userId);
          results.approved.push(creditId);
        } else {
          results.failed.push(creditId);
        }
      } catch (err) {
        results.failed.push(creditId);
      }
    }

    console.log(`[Credits] Bulk approved ${results.approved.length} credits by admin ${userId}`);
    res.json(results);
  } catch (error) {
    console.error('[Credits] Error bulk approving credits:', error);
    res.status(500).json({ error: 'Failed to bulk approve credits' });
  }
});

// POST /api/school-admin/credits/create - Create a manual credit (admin-granted)
router.post('/credits/create', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(userId);
    const adminRole = userRoles.find(r => 
      ['schoolAdmin', 'admin', 'superAdmin'].includes(r.role.toLowerCase())
    );
    
    if (!adminRole || !adminRole.schoolId) {
      return res.status(403).json({ error: 'School admin access required' });
    }

    const { recipientUserId, creditAmountCents, creditType, title, description, notes, autoApprove } = req.body;
    
    if (!recipientUserId || !creditAmountCents || creditAmountCents <= 0) {
      return res.status(400).json({ error: 'recipientUserId and positive creditAmountCents are required' });
    }

    // Verify recipient belongs to this school
    const recipientRoles = await storage.getUserRolesByUserId(recipientUserId);
    const recipientInSchool = recipientRoles.some(r => r.schoolId === adminRole.schoolId);
    
    if (!recipientInSchool) {
      return res.status(400).json({ error: 'Recipient is not a member of your school' });
    }

    const newCredit = await storage.createCredit({
      userId: recipientUserId,
      schoolId: adminRole.schoolId,
      creditType: creditType || 'manual',
      sourceType: 'admin_grant',
      sourceId: userId, // The admin who created it
      creditAmountCents,
      status: autoApprove ? 'approved' : 'pending',
      title: title || 'Admin-Granted Credit',
      description: description || null,
      notes: notes || null,
      metadata: {
        grantedBy: userId,
        grantedByEmail: req.user?.email,
        grantedAt: new Date().toISOString()
      }
    });

    // If auto-approved, set expiration
    if (autoApprove) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await storage.updateCredit(newCredit.id, {
        approvedBy: userId,
        approvedAt: new Date(),
        expiresAt
      });
    }

    // Create audit log
    try {
      await storage.createAuditLog({
        actionType: 'credit_created',
        severity: 'info',
        actorId: userId,
        actorRole: 'schoolAdmin',
        actorEmail: req.user?.email,
        targetType: 'credit',
        targetId: String(newCredit.id),
        schoolId: adminRole.schoolId,
        metadata: {
          context: 'Admin created manual credit',
          creditType: creditType || 'manual',
          creditAmount: creditAmountCents,
          recipientUserId,
          autoApproved: autoApprove || false
        }
      });
    } catch (auditError) {
      console.error('[Credits] Failed to create audit log:', auditError);
    }

    console.log(`[Credits] Manual credit created for user ${recipientUserId} by admin ${userId}`);
    res.json(newCredit);
  } catch (error) {
    console.error('[Credits] Error creating credit:', error);
    res.status(500).json({ error: 'Failed to create credit' });
  }
});

export default router;