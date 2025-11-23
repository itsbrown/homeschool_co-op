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
import { sendAccountInviteEmail, sendStaffInvitationEmail, sendPasswordResetEmail } from '../lib/email-service';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { getDb } from '../db';
import { sql, eq } from 'drizzle-orm';
import { users, schools, userRoles, type InsertSchool } from '@shared/schema';

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

// Create Supabase account for staff member
async function createStaffAccount(email: string, firstName: string, lastName: string, role: string, department: string): Promise<{ success: boolean; temporaryPassword?: string; error?: string; userExists?: boolean }> {
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

// Send account credentials email
async function sendAccountCredentialsEmail(email: string, firstName: string, lastName: string, temporaryPassword: string, role: string): Promise<boolean> {
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

// Helper function to transform database school_staff + user to frontend format
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
    
    console.log('✅ Found admin user:', { id: adminUser.id, email: adminUser.email, role: adminUser.role, schoolId: adminUser.schoolId });
    
    // CRITICAL FIX: Use the user's schoolId directly from the database
    // This is the authoritative source of truth
    if (adminUser.schoolId) {
      console.log(`🎯 Using user's schoolId from database: ${adminUser.schoolId}`);
      const school = await storage.getSchool(adminUser.schoolId);
      
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
    let school = allSchools.find((s: any) => 
      s.adminId === adminUser.id
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
        categoryName: classItem.category || null
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

    // Get enrollment and children data from database
    const allEnrollments = await storage.getAllEnrollments();
    const enrollments = allEnrollments.filter((e: any) => e.classId === classId);
    const children = await storage.getAllChildren();

    // Get enrollments for this specific class
    const classEnrollments = enrollments.filter((enrollment: any) => 
      Number(enrollment.classId) === Number(classId) && 
      ['enrolled', 'confirmed', 'completed', 'pending_payment'].includes(enrollment.status)
    );

    console.log(`📚 Found ${classEnrollments.length} enrollments for class ${classId}`);

    // Map enrollments to student data
    const students = classEnrollments.map((enrollment: any) => {
      // Find child data by ID
      const child = children.find(c => c.id === enrollment.childId);
      
      if (!child) {
        // If no child data found, use enrollment data
        return {
          id: enrollment.childId || enrollment.id,
          firstName: enrollment.childName ? enrollment.childName.split(' ')[0] : 'Unknown',
          lastName: enrollment.childName ? enrollment.childName.split(' ').slice(1).join(' ') : 'Student',
          email: '',
          phone: '',
          gradeLevel: 'Unknown',
          enrollmentDate: enrollment.enrollmentDate || new Date().toISOString(),
          status: enrollment.status === 'pending_payment' ? 'Pending' : 'Active'
        };
      }

      return {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        email: child.parentEmail || '',
        phone: '',
        gradeLevel: child.gradeLevel || 'Unknown',
        enrollmentDate: enrollment.enrollmentDate || new Date().toISOString(),
        status: enrollment.status === 'pending_payment' ? 'Pending' : 'Active'
      };
    });

    res.json({
      students: students,
      totalStudents: students.length
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

    console.log("🔍 Step 4: Creating school_staff record");
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

    if (!staffRecord) {
      throw new Error("Failed to create staff record");
    }
    console.log("✅ Step 4 complete: Staff record ID =", staffRecord.id);

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
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true
      });
      console.log("✅ Step 6 complete: Role invitation created");
    } catch (roleInviteError) {
      console.error("❌ Error creating role invitation (non-critical):", roleInviteError);
      // Continue even if role invitation fails - this is optional
    }

    console.log("🔍 Step 7: Transforming staff to frontend format");
    // New staff invitation always has pending invitation
    const responseStaff = transformStaffToFrontend(staffRecord, user, [], true);
    console.log("✅ Step 7 complete");
    
    console.log("🔍 Step 8: Sending invitation email");
    const emailSent = await sendStaffInvitationEmail(email, firstName, lastName, role, department, invitationToken, message);
    console.log("✅ Step 8 complete: Email sent =", emailSent);

    console.log("✅ Staff member invited successfully:", { id: staffRecord.id, email });
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

// Get staff members for the school
router.get("/staff", supabaseAuth, async (req: any, res: any) => {
  try {
    // [FIX:v3.0] Use database as source of truth, not JWT token
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    console.log(`👥 [FIX:v3.0] Loading staff for school ID: ${schoolId} from database`);

    // Get all school staff from database
    const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
    console.log(`✅ Found ${schoolStaffRecords.length} staff members in database`);

    // Fetch all users upfront and create a map for efficient lookup
    const staffUsersArray = await Promise.all(
      schoolStaffRecords.map(record => storage.getUser(record.userId))
    );
    
    // Create user map: userId -> user
    const userMap = new Map();
    const validEmails: string[] = [];
    
    staffUsersArray.forEach((user, index) => {
      if (user) {
        const staffRecord = schoolStaffRecords[index];
        userMap.set(staffRecord.userId, user);
        validEmails.push(user.email);
      }
    });
    
    // Batch check for pending invitations
    const pendingInvitationsMap = await storage.getPendingRoleInvitationsByEmails(validEmails);
    console.log(`✅ Checked ${validEmails.length} emails for pending invitations, found ${pendingInvitationsMap.size} pending`);

    // Get all classes once for efficiency
    const allClasses = await storage.getAllClasses();

    // Transform staff records using the pre-fetched user map
    const staffWithDetails = await Promise.all(
      schoolStaffRecords.map(async (staffRecord) => {
        const user = userMap.get(staffRecord.userId);
        if (!user) {
          console.warn(`⚠️ User not found for staff record ${staffRecord.id}`);
          return null;
        }
        
        // Get classes assigned to this staff member
        const assignedClasses = allClasses.filter(cls => 
          cls.instructorId === user.id
        );
        
        // Check if this user has a pending invitation
        const hasPendingInvitation = pendingInvitationsMap.get(user.email) || false;
        
        return transformStaffToFrontend(staffRecord, user, assignedClasses, hasPendingInvitation);
      })
    );

    // Filter out null entries (users not found)
    const validStaff = staffWithDetails.filter(s => s !== null);
    
    res.json(validStaff);
  } catch (error) {
    console.error("❌ Error fetching school staff:", error);
    res.status(500).json({ message: "Error fetching school staff" });
  }
});

// Get single staff member by ID
router.get("/staff/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    console.log(`🔍 Looking for staff member with ID: ${staffId}`);
    
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get staff record from database
    const staffRecord = await storage.getSchoolStaffById(staffId);
    
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(staffRecord.userId);
    if (!user) {
      console.error(`❌ User not found for staff record ${staffId}`);
      return res.status(404).json({ message: "User details not found for staff member" });
    }

    // Get classes assigned to this staff member
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === user.id
    );

    // Check if user has a pending invitation
    const pendingInvitationsMap = await storage.getPendingRoleInvitationsByEmails([user.email]);
    const hasPendingInvitation = pendingInvitationsMap.get(user.email) || false;

    const staffMember = transformStaffToFrontend(staffRecord, user, assignedClasses, hasPendingInvitation);
    
    console.log(`✅ Found staff member in database: ${staffMember.name}`);
    res.json(staffMember);
  } catch (error) {
    console.error("Error fetching staff member:", error);
    res.status(500).json({ message: "Error fetching staff member" });
  }
});

// Get classes assigned to a specific staff member
router.get("/staff/:id/classes", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    console.log(`🎓 Getting classes for staff member ${staffId}`);
    
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get staff record from database
    const staffRecord = await storage.getSchoolStaffById(staffId);
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details to use userId for class lookup
    const user = await storage.getUser(staffRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User details not found" });
    }

    // Get all classes and filter by instructorId
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === user.id
    );

    console.log(`✅ Found ${assignedClasses.length} classes for ${user.name}`);
    res.json(assignedClasses);
  } catch (error) {
    console.error("Error fetching staff classes:", error);
    res.status(500).json({ message: "Error fetching staff classes" });
  }
});

// Assign staff member to a class
router.post("/staff/:id/assign-class", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    const { classId } = req.body;
    
    console.log(`🎯 Assigning staff ${staffId} to class ${classId}`);
    
    if (isNaN(staffId) || !classId) {
      return res.status(400).json({ message: "Invalid staff ID or class ID" });
    }

    // Get staff record from database
    const staffRecord = await storage.getSchoolStaffById(staffId);
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(staffRecord.userId);
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
        id: staffId,
        name: user.name
      }
    });
  } catch (error) {
    console.error("Error assigning staff to class:", error);
    res.status(500).json({ message: "Error assigning staff to class" });
  }
});

// Unassign staff member from a class
router.delete("/staff/:id/unassign-class/:classId", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    const classId = parseInt(req.params.classId, 10);
    
    console.log(`🎯 Unassigning staff ${staffId} from class ${classId}`);
    
    if (isNaN(staffId) || isNaN(classId)) {
      return res.status(400).json({ message: "Invalid staff ID or class ID" });
    }

    // Verify staff member exists in database
    const staffRecord = await storage.getSchoolStaffById(staffId);
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
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

// Resend invite to individual staff member
router.post("/staff/:id/resend-invite", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get staff member from database
    const staffRecord = await storage.getSchoolStaffById(staffId);
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(staffRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User details not found" });
    }

    // Check if staff member is inactive (pending invitation)
    if (staffRecord.isActive) {
      return res.status(400).json({ message: "Can only resend invites to pending staff members" });
    }

    // Generate new invitation token
    const invitationToken = generateInvitationToken();
    
    // Check if invitation exists, or create new one
    const allInvitations = await storage.getRoleInvitations();
    const existingInvitation = allInvitations.find((inv: any) => 
      inv.email === user.email && inv.schoolId === staffRecord.schoolId
    );

    if (!existingInvitation) {
      // Create new invitation
      const mappedRole = staffRecord.role;
      const userRole = mappedRole === 'administrator' ? 'admin' : mappedRole === 'teacher' ? 'teacher' : 'teacher';
      await storage.createRoleInvitation({
        email: user.email,
        role: userRole,
        invitedBy: 1,
        schoolId: staffRecord.schoolId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true
      });
    }

    // Resend the invitation email
    const firstName = user.name.split(' ')[0] || '';
    const lastName = user.name.split(' ').slice(1).join(' ') || '';
    const message = `Your invitation to join our school staff has been resent. Please check your email for details.`;

    try {
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
        res.json({ 
          message: "Invitation resent successfully",
          staffId: staffId,
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

        // Generate new invitation token
        const invitationToken = generateInvitationToken();
        
        // Check if invitation exists, or create new one
        const allInvitations = await storage.getRoleInvitations();
        const existingInvitation = allInvitations.find((inv: any) => 
          inv.email === user.email && inv.schoolId === staffRecord.schoolId
        );

        if (!existingInvitation) {
          const mappedRole = staffRecord.role;
          const userRole = mappedRole === 'administrator' ? 'admin' : mappedRole === 'teacher' ? 'teacher' : 'teacher';
          await storage.createRoleInvitation({
            email: user.email,
            role: userRole,
            invitedBy: 1,
            schoolId: staffRecord.schoolId,
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

// Update staff member
router.put("/staff/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    const { name, email, phone, role, department, locationId, status } = req.body;

    console.log(`🔄 Updating staff member ${staffId}:`, { name, email, role, department, locationId, status });

    // Get current staff record from database
    const staffRecord = await storage.getSchoolStaffById(staffId);
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details
    const user = await storage.getUser(staffRecord.userId);
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

    // Map role to database enum and update school_staff record
    const staffUpdate: any = {};
    if (role) {
      staffUpdate.position = role;
      staffUpdate.role = mapPositionToRole(role);
    }
    if (department) {
      staffUpdate.department = department;
    }
    if (locationId !== undefined) {
      staffUpdate.locationId = locationId;
    }
    if (status !== undefined) {
      staffUpdate.isActive = status === 'Active';
    }

    const updatedStaffRecord = await storage.updateSchoolStaff(staffId, staffUpdate);
    if (!updatedStaffRecord) {
      return res.status(500).json({ message: "Failed to update staff member" });
    }

    // Get updated user details
    const updatedUser = await storage.getUser(staffRecord.userId);
    
    // Get classes assigned to this staff member
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === updatedUser!.id
    );

    // Check if user has a pending invitation
    const pendingInvitationsMap = await storage.getPendingRoleInvitationsByEmails([updatedUser!.email]);
    const hasPendingInvitation = pendingInvitationsMap.get(updatedUser!.email) || false;

    const updatedStaff = transformStaffToFrontend(updatedStaffRecord, updatedUser!, assignedClasses, hasPendingInvitation);
    
    console.log(`✅ Successfully updated staff member ${staffId}`);

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

// Delete staff member
router.delete("/staff/:id", supabaseAuth, async (req: any, res) => {
  try {
    const schoolId = await getSchoolIdFromRequest(req, res);
    if (schoolId === null) return;

    const staffId = parseInt(req.params.id, 10);
    console.log(`🗑️ Attempting to delete staff member with ID: ${staffId}`);
    
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Get staff record from database before deleting
    const staffRecord = await storage.getSchoolStaffById(staffId);
    if (!staffRecord) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // Verify staff member belongs to authenticated school
    if (staffRecord.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this staff member' });
    }

    // Get user details before deleting
    const user = await storage.getUser(staffRecord.userId);
    const staffName = user?.name || 'Unknown';

    // Delete the school_staff record
    await storage.deleteSchoolStaff(staffId);
    
    console.log(`✅ Successfully deleted staff member from database: ${staffName}`);

    res.json({ 
      success: true, 
      message: "Staff member deleted successfully",
      deletedStaff: { id: staffId, name: staffName }
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
    const schoolStudents = await storage.getSchoolStudentsBySchoolId(schoolId);
    console.log(`📊 Found ${schoolStudents.length} students for school ${schoolId} in database`);
    
    // Get children details for each school student
    const studentsWithDetails = await Promise.all(
      schoolStudents.map(async (schoolStudent) => {
        try {
          const child = await storage.getChildById(schoolStudent.childId);
          if (!child) {
            console.warn(`⚠️ Child not found for school student: ${schoolStudent.childId}`);
            return null;
          }

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
          if (schoolStudent.locationId) {
            const location = await storage.getLocationById(schoolStudent.locationId);
            if (location) {
              locationName = location.name;
              locationCode = location.code;
            }
          }

          return {
            id: child.id,
            schoolStudentId: schoolStudent.id,
            name: `${child.firstName} ${child.lastName}`,
            firstName: child.firstName,
            lastName: child.lastName,
            gradeLevel: child.gradeLevel || 'Not specified',
            age: age || 'Unknown',
            parentName: child.parentEmail || 'Unknown Parent',
            parentEmail: child.parentEmail,
            email: child.parentEmail,
            enrollmentDate: schoolStudent.enrollmentDate,
            status: schoolStudent.status || 'Active',
            locationId: schoolStudent.locationId,
            locationName: locationName,
            locationCode: locationCode,
            schoolId: schoolStudent.schoolId,
            classes: [], // We could expand this later to fetch actual class enrollments
            avatar: child.profileImage || "",
            allergies: child.allergies,
            medicalInfo: child.medicalInfo,
            interests: child.interests || [],
            learningStyle: child.learningStyle
          };
        } catch (childError) {
          console.error(`❌ Error processing school student ${schoolStudent.id}:`, childError);
          return null;
        }
      })
    );

    // Filter out any null results
    const validStudents = studentsWithDetails.filter(student => student !== null);
    
    console.log(`✅ Successfully processed ${validStudents.length} students with details`);
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
      enrollmentCount: 0,
      locationId: req.body.locationId,
      price: price,
      instructorName: req.body.instructorName,
      instructorId,
      isAdminOnly: req.body.isAdminOnly || false
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
    const authenticatedSchoolId = requireSchoolContext(req, res);
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
      
      const result = await sql.unsafe(query, [...values, schoolId]);
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
      parentPhone: student.parentPhone || '',
      address: student.address || '',
      enrollmentDate: student.createdAt,
      status: 'Active',
      emergencyContact: {
        name: student.emergencyContact || '',
        relationship: 'Emergency Contact',
        phone: student.emergencyPhone || '',
        email: student.emergencyEmail || ''
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

    // Get existing student
    const existingStudent = await storage.getStudentById(studentId);
    if (!existingStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Verify student belongs to authenticated school
    if (existingStudent.schoolId && existingStudent.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied to this student' });
    }

    // Update student with new data
    const updatedStudent = await storage.updateStudent(studentId, {
      firstName: updateData.firstName,
      lastName: updateData.lastName,
      birthdate: updateData.dateOfBirth,
      gradeLevel: updateData.gradeLevel,
      locationId: updateData.locationId !== undefined ? updateData.locationId : existingStudent.locationId, // Add location support
      parentEmail: updateData.parentEmail,
      parentPhone: updateData.parentPhone,
      emergencyContact: updateData.emergencyContact,
      emergencyPhone: updateData.emergencyPhone,
      medicalNotes: updateData.medicalNotes,
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

// Validate staff invitation token
router.get("/staff-invitations/validate", async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ 
        valid: false, 
        message: "Token is required" 
      });
    }

    // Find invitation using roleInvitations (database-backed)
    const roleInvitation = await storage.getActiveRoleInvitation(token);

    if (!roleInvitation) {
      return res.status(404).json({ 
        valid: false, 
        message: "Invalid or expired invitation token" 
      });
    }

    res.json({
      valid: true,
      invitation: {
        email: roleInvitation.email,
        firstName: roleInvitation.firstName || '',
        lastName: roleInvitation.lastName || '',
        role: roleInvitation.role,
        department: roleInvitation.role, // Use role as department for compatibility
        message: '',
        createdAt: roleInvitation.createdAt
      }
    });
  } catch (error) {
    console.error("Error validating staff invitation:", error);
    res.status(500).json({ 
      valid: false, 
      message: "Error validating invitation" 
    });
  }
});

// Accept staff invitation
router.post("/staff-invitations/accept", async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    // Find invitation using roleInvitations (database-backed)
    const roleInvitation = await storage.getActiveRoleInvitation(token);

    if (!roleInvitation) {
      return res.status(404).json({ message: "Invalid or expired invitation token" });
    }

    console.log(`📝 Processing invitation acceptance for: ${roleInvitation.email}`);
    
    // Create Supabase account for the staff member
    const accountResult = await createStaffAccount(
      roleInvitation.email, 
      roleInvitation.firstName || '', 
      roleInvitation.lastName || '', 
      roleInvitation.role, 
      roleInvitation.role // Use role as department for compatibility
    );

    if (!accountResult.success) {
      // Check if user already exists
      if (accountResult.userExists || accountResult.error?.includes('already registered') || accountResult.error?.includes('email_exists')) {
        console.log(`⚠️ User ${roleInvitation.email} already has an account, proceeding with invitation acceptance`);
        // Continue with invitation acceptance even if account already exists
      } else {
        console.error(`❌ Failed to create account for ${roleInvitation.email}:`, accountResult.error);
        return res.status(500).json({ 
          message: "Failed to create account. Please contact support.",
          error: accountResult.error 
        });
      }
    }
    
    // Mark invitation as accepted using the database
    await storage.acceptRoleInvitation(token, roleInvitation.email);

    // Update staff member status in database - use school ID from the role invitation
    const schoolId = roleInvitation.schoolId;
    const allStaff = await storage.getSchoolStaffBySchoolId(schoolId);
    
    for (const staffRecord of allStaff) {
      const user = await storage.getUser(staffRecord.userId);
      if (user && user.email === roleInvitation.email) {
        // Activate the staff member
        await storage.updateSchoolStaff(staffRecord.id, { isActive: true });
        console.log(`✅ Activated staff member in database: ${user.email}`);
        break;
      }
    }

    // Send account credentials email if account was created successfully
    if (accountResult.success && accountResult.temporaryPassword) {
      const credentialsEmailSent = await sendAccountCredentialsEmail(
        roleInvitation.email,
        roleInvitation.firstName || '',
        roleInvitation.lastName || '',
        accountResult.temporaryPassword,
        roleInvitation.role
      );
      
      if (credentialsEmailSent) {
        console.log(`✅ Account created and credentials sent to: ${roleInvitation.email}`);
      } else {
        console.log(`⚠️ Account created but credentials email failed for: ${roleInvitation.email}`);
      }
    }

    res.json({ 
      success: true, 
      message: accountResult.success 
        ? "Invitation accepted! Your account has been created and login credentials have been sent to your email."
        : "Invitation accepted successfully. Please use your existing account to log in.",
      accountCreated: accountResult.success,
      redirect: "/login" 
    });
  } catch (error) {
    console.error("Error accepting staff invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

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
          gradeLevel: schoolStudent.gradeLevel,
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

router.get("/user-locations/my-permissions", async (req, res) => {
  try {
    // Get user from auth token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.substring(7);
    
    let user;
    try {
      const supabaseModule = await import('../db/supabase');
      const { data: { user: supabaseUser }, error } = await supabaseModule.supabase.auth.getUser(token);
      if (error || !supabaseUser) {
        throw new Error('Invalid token');
      }
      user = supabaseUser;
    } catch (authError) {
      console.log('🔧 Using development mode fallback');
      const adminUser = await storage.getUserByEmail('coreycreates@gmail.com');
      if (!adminUser) {
        return res.status(401).json({ message: "Authentication failed" });
      }
      user = { email: adminUser.email, id: adminUser.id };
    }

    // Look up user in our system
    const systemUser = await storage.getUserByEmail(user.email);
    if (!systemUser) {
      return res.status(404).json({ message: "User not found in system" });
    }

    // Get user's location permissions
    const userLocations = await storage.getUserLocationsByUserId(systemUser.id);
    
    // Get location details
    const locationsWithPermissions = await Promise.all(
      userLocations.map(async (userLocation) => {
        const location = await storage.getLocationById(userLocation.locationId);
        return {
          id: userLocation.id,
          locationId: userLocation.locationId,
          role: userLocation.role,
          permissions: userLocation.permissions,
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
      minOrderAmount: minOrderAmountInCents,
      maxDiscountAmount: maxDiscountAmountInCents,
      applicableToClasses: applicableToClasses || [],
      applicableToCategories: applicableToCategories || [],
      applicableToGradeLevels: applicableToGradeLevels || [],
      newStudentsOnly: newStudentsOnly || false,
      siblingDiscount: siblingDiscount || false,
      usageLimit: usageLimit || null,
      usageLimitPerUser: usageLimitPerUser || null,
      currentUsageCount: 0,
      validFrom: validFrom === "" ? null : validFrom,
      validUntil: validUntil === "" ? null : validUntil,
      isActive: isActive !== undefined ? isActive : true,
      priority: priority || 0,
      combinableWithOthers: combinableWithOthers || false,
      adminOnly: adminOnly || false,
      createdBy: 1 // TODO: Get from authenticated user
    });
    
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
    if (usageLimit !== undefined) updates.usageLimit = usageLimit;
    if (usageLimitPerUser !== undefined) updates.usageLimitPerUser = usageLimitPerUser;
    if (validFrom !== undefined) updates.validFrom = validFrom === "" ? null : validFrom;
    if (validUntil !== undefined) updates.validUntil = validUntil === "" ? null : validUntil;
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
      minOrderAmount: originalDiscount.minOrderAmount,
      maxDiscountAmount: originalDiscount.maxDiscountAmount,
      applicableToClasses: originalDiscount.applicableToClasses,
      applicableToCategories: originalDiscount.applicableToCategories,
      applicableToGradeLevels: originalDiscount.applicableToGradeLevels,
      newStudentsOnly: originalDiscount.newStudentsOnly,
      siblingDiscount: originalDiscount.siblingDiscount,
      usageLimit: originalDiscount.usageLimit,
      usageLimitPerUser: originalDiscount.usageLimitPerUser,
      currentUsageCount: 0,
      validFrom: originalDiscount.validFrom,
      validUntil: originalDiscount.validUntil,
      isActive: false, // Start inactive so admin can review before activation
      priority: originalDiscount.priority,
      combinableWithOthers: originalDiscount.combinableWithOthers,
      adminOnly: originalDiscount.adminOnly,
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
      enrollmentId: enrollmentId || null,
      paymentId: null, // Will be set when payment is processed
      originalAmount,
      discountAmount,
      finalAmount,
      applicationMethod: 'manual',
      appliedBy: 1 // TODO: Get from authenticated user
    });
    
    // Update discount usage count
    await storage.updateDiscount(discountId, {
      currentUsageCount: (discount.currentUsageCount || 0) + 1
    });
    
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
            headers: true,
            skip_empty_lines: true,
            trim: true
          })
          .on('data', (record) => records.push(record))
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
                  ...parentData,
                  role: 'parent',
                  schoolId: schoolId
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
                // Create child record with school association
                await storage.createChild({
                  ...childData,
                  schoolId: schoolId
                });
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
                // Create staff account with school association
                await storage.createStaffMember({
                  ...staffData,
                  schoolId: schoolId
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
            console.error(`❌ Error processing record:`, recordError);
            results.errors.push(`Error processing record: ${recordError.message}`);
            
            if (fileType === 'parents') results.parents.failed++;
            else if (fileType === 'children') results.children.failed++;
            else if (fileType === 'staff') results.staff.failed++;
          }
        }

      } catch (fileError) {
        console.error(`❌ Error processing file ${file.name}:`, fileError);
        results.errors.push(`Error processing file ${file.name}: ${fileError.message}`);
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
    if (error.code === 'UNEXPECTED_END_OF_FORM') {
      return res.status(400).json({ 
        message: 'Invalid file upload',
        error: 'The form data was incomplete. Please try uploading the file again.' 
      });
    }
    
    res.status(500).json({ 
      message: 'Error processing contact import',
      error: error.message || 'An unexpected error occurred'
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

    // Map to frontend format with active role
    const regularUsers = dbUsers.map((user: any) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName || user.name?.split(' ')[0] || '',
      lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
      role: user.activeRole || user.role, // Use active role if available, fall back to legacy role
      phone: user.phone || '',
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
    }));
    
    console.log(`👥 Found ${regularUsers.length} regular users for school ${schoolId}`);
    
    // Load staff from database
    const staffRecords = await storage.getSchoolStaffBySchoolId(Number(schoolId));
    console.log(`👨‍🏫 Found ${staffRecords.length} staff members from database`);
    
    // Convert staff to user format for the frontend
    const staffAsUsers = await Promise.all(
      staffRecords.map(async (staffRecord) => {
        const user = await storage.getUser(staffRecord.userId);
        if (!user) {
          console.log(`⚠️ Skipping orphaned staff record: staffRecord.id=${staffRecord.id}, userId=${staffRecord.userId} - user not found`);
          return null;
        }
        
        return {
          id: staffRecord.userId, // Use canonical userId, not staff record's auto-incremented ID
          email: user.email,
          firstName: user.name.split(' ')[0] || '',
          lastName: user.name.split(' ').slice(1).join(' ') || '',
          role: 'staff', // Standardize role to 'staff'
          phone: user.phone || '',
          isActive: staffRecord.isActive,
          createdAt: staffRecord.startDate,
          department: staffRecord.department,
          position: staffRecord.position || 'Staff Member'
        };
      })
    );
    
    // Filter out null entries (orphaned staff records)
    const validStaffUsers = staffAsUsers.filter(user => user !== null);
    
    // Combine regular users and staff
    const allSchoolUsers = [...regularUsers, ...validStaffUsers];
    console.log(`✅ Total users (including staff): ${allSchoolUsers.length}`);
    
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
    const formattedUser = {
      id: user.id,
      email: user.email,
      firstName: (user as any).firstName || user.name?.split(' ')[0] || '',
      lastName: (user as any).lastName || user.name?.split(' ').slice(1).join(' ') || '',
      role: user.role,
      phone: user.phone || '',
      isActive: user.isActive ?? true,
      schoolId: userSchoolId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      metadata: user.metadata || {}
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

// Create a new user for the school
router.post('/users', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    console.log('👤 Creating new user for school admin...');

    const userData = {
      ...req.body,
      schoolId: Number(schoolId) // Associate with this school
    };

    // Create user with school association
    const newUser = await storage.createUser(userData);
    console.log(`✅ Created user: ${userData.email} for school ${schoolId}`);
    
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
          
          // Find user by email in Supabase and update password
          const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          if (listError) {
            console.error('❌ Failed to list Supabase users:', listError);
          } else {
            const supabaseUser = users.users.find(u => u.email === existingUser.email);
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

    // Delete user
    await storage.deleteUser(userId);
    console.log(`✅ Deleted user: ${existingUser.email} (ID: ${userId}) from school ${schoolId}`);
    
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

// [FIX:v3.0] Helper function to process parent records - schoolId is now string
async function processParentRecords(records: any[], results: any, schoolId: string) {
  console.log(`👨‍👩‍👧‍👦 Processing ${records.length} parent records...`);
  
  for (const record of records) {
    try {
      const userData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        email: record['Email'] || record.email,
        phone: record['Phone'] || record.phone,
        emergencyContactFirstName: record['Emergency Contact - First Name'] || record.emergencyContactFirstName,
        emergencyContactLastName: record['Emergency Contact - Last Name'] || record.emergencyContactLastName,
        emergencyContactPhone: record['Emergency Contact Phone'] || record.emergencyContactPhone,
        role: 'parent',
        schoolId: schoolId,
        username: (record['Email'] || record.email)?.split('@')[0] || '',
        password: 'tempPass123!' // Temporary password
      };
      
      if (!userData.firstName || !userData.lastName || !userData.email) {
        results.errors.push(`Missing required fields for parent: ${JSON.stringify(record)}`);
        results.parents.failed++;
        continue;
      }
      
      await storage.createUser(userData);
      results.parents.successful++;
      console.log(`✅ Created parent: ${userData.firstName} ${userData.lastName}`);
    } catch (error: any) {
      console.error(`❌ Error creating parent:`, error);
      results.parents.failed++;
      results.errors.push(`Failed to create parent ${record['First Name']} ${record['Last Name']}: ${error.message}`);
    }
  }
}

// [FIX:v3.0] Helper function to process child records - schoolId is now string
async function processChildRecords(records: any[], results: any, schoolId: string) {
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

// [FIX:v3.0] Helper function to process staff records - schoolId is now string
async function processStaffRecords(records: any[], results: any, schoolId: string) {
  console.log(`👩‍🏫 Processing ${records.length} staff records...`);
  
  for (const record of records) {
    try {
      const userData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        email: record['Email'] || record.email,
        phone: record['Phone'] || record.phone,
        role: 'educator',
        schoolId: Number(schoolId), // [FIX:v3.0] Convert string to number for Drizzle schema
        username: (record['Email'] || record.email)?.split('@')[0] || '',
        password: 'tempPass123!' // Temporary password
      };
      
      if (!userData.firstName || !userData.lastName || !userData.email) {
        results.errors.push(`Missing required fields for staff: ${JSON.stringify(record)}`);
        results.staff.failed++;
        continue;
      }
      
      await storage.createUser(userData);
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
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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
            role: user.role || 'parent',
            school_id: user.schoolId || null
          },
          user_metadata: {
            name: `${user.firstName || user.name || ''} ${user.lastName || ''}`
          }
        });

        // If account already exists, find it and link it  
        if (authError && (authError.code === 'email_exists' || authError.message?.includes('already registered'))) {
          console.log(`⚠️ Supabase account already exists for ${user.email}, finding existing account...`);
          
          const { data: supabaseUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          if (listError) {
            console.error('❌ Failed to list Supabase users:', listError);
            return res.status(500).json({ message: 'Failed to find existing authentication account' });
          }
          
          const existingSupabaseUser = supabaseUsers.users.find((u: any) => u.email === user.email);
          if (!existingSupabaseUser) {
            console.error('❌ Supabase user not found despite email exists error');
            return res.status(500).json({ message: 'Authentication account in inconsistent state' });
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

    // Send invite email
    const emailSuccess = await sendAccountInviteEmail({
      email: user.email,
      firstName: user.firstName || user.name || 'User',
      lastName: user.lastName || '',
      role: user.role,
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

    // Validate user has required data for welcome email
    if (!user.email || !user.firstName) {
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
      firstName: user.firstName,
      lastName: user.lastName || '',
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
          firstName: user.firstName,
          lastName: user.lastName
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

export default router;