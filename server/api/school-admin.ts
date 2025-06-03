import { Router } from "express";
import { storage } from "../storage";
import fs from 'fs';
import path from 'path';
import sgMail from "@sendgrid/mail";

const router = Router();

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized for staff invitations');
} else {
  console.warn('⚠️ SENDGRID_API_KEY not found - staff invitation emails will not be sent');
}

// Send staff invitation email
async function sendStaffInvitationEmail(email: string, firstName: string, lastName: string, role: string, department: string, message?: string): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('📧 SendGrid not configured, skipping email send');
      return false;
    }

    const invitationUrl = `https://${process.env.REPL_ID}.replit.app/auth/login`;
    
    const msg = {
      to: email,
      from: 'contact@americanseekersacademy.com',
      subject: `You've been invited to join American Seekers Academy as ${role}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">You're Invited to Join American Seekers Academy</h2>
          <p>Hello ${firstName} ${lastName},</p>
          <p>You've been invited to join American Seekers Academy as a <strong>${role}</strong> in the <strong>${department}</strong> department.</p>
          ${message ? `<p><em>"${message}"</em></p>` : ''}
          <p>Click the button below to access the platform and get started:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Access Platform
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${invitationUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Welcome to the team! If you have any questions, please contact our support team.
          </p>
        </div>
      `,
    };

    await sgMail.send(msg);
    console.log(`✅ Staff invitation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send staff invitation email:', error);
    return false;
  }
}

// Test route to verify router is working
router.get("/test", (req, res) => {
  console.log("🚨 TEST ROUTE HIT!");
  res.json({ message: "School admin router is working!" });
});

// Removed problematic authentication middleware that was blocking PATCH requests

// School admin login now handled through Supabase authentication
// Removed hardcoded authentication bypass for security

// Get the school associated with the logged-in school administrator
router.get("/my-school", async (req, res) => {
  try {
    console.log('🏫 Fetching school data for admin');

    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "No authorization header" });
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a new Supabase client instance with the user's access token
    const { createClient } = await import('@supabase/supabase-js');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return res.status(500).json({ message: "Supabase configuration missing" });
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
      console.error('Auth error:', authError);
      return res.status(401).json({ message: "Invalid token" });
    }

    console.log('✅ Authenticated user:', user.email);

    // Use admin client to query the schools table with service role permissions
    const { supabaseAdmin } = await import('../db/supabase');

    console.log('🔍 Attempting to query database...');

    try {
      // Query the public.users table to get user data by email
      console.log('🔍 Querying public.users for email:', user.email);
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', user.email)
        .eq('role', 'schoolAdmin')
        .single();

      if (userError || !userData) {
        console.error('User lookup error:', userError?.message);
        return res.status(404).json({ 
          message: "School admin user not found",
          error: userError?.message
        });
      }

      console.log('✅ Found user ID:', userData.id);

      // Query the public.schools table
      console.log('🔍 Querying public.schools for admin_id:', userData.id);
      const { data: schoolData, error: schoolError } = await supabaseAdmin
        .from('schools')
        .select('*')
        .eq('admin_id', userData.id)
        .single();

      if (schoolError || !schoolData) {
        console.error('School lookup error:', schoolError?.message);
        return res.status(404).json({ 
          message: "No school found for this administrator",
          error: schoolError?.message
        });
      }

      console.log('🚀 Returning school data from database:', schoolData.name);
      res.json(schoolData);

    } catch (error) {
      console.error('Database access error:', error);
      return res.status(500).json({ 
        message: "Unable to connect to database. Please verify your Supabase credentials.",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error("Error fetching school information:", error);
    res.status(500).json({ message: "Error fetching school information" });
  }
});

// Create initial school setup for a new admin

async function setupSchool(req: any, res: any) {
  let client;
  try {
    console.log('🏫 Setting up school for new admin');

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log('❌ No authorization header provided');
      return res.status(401).json({ message: "No authorization header" });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('🔒 Token:', token.substring(0, 20) + '...');

    const { supabase } = await import('../db/supabase');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Auth error:', authError?.message);
      return res.status(401).json({ message: "Invalid token", error: authError?.message });
    }

    console.log('✅ Setting up school for user:', user.email);

    client = await pool.connect();
    console.log('🔌 Connected to PostgreSQL database');

    console.log('🔍 Checking if user exists in database:', user.email);
    const userResult = await client.query(
      'SELECT * FROM users.accounts WHERE email = $1',
      [user.email]
    );
    let dbUser = userResult.rows[0];

    if (!dbUser) {
      console.log('❌ User not found, creating new user...');
      const newUserResult = await client.query(
        'INSERT INTO users.accounts (email, firebase_uid, username, role, name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [
          user.email,
          user.id,
          user.email.split('@')[0],
          'schoolAdmin',
          user.user_metadata?.full_name || user.email
        ]
      );
      dbUser = newUserResult.rows[0];
      console.log('✅ Created user:', dbUser);
    } else {
      console.log('✅ User found:', dbUser);
    }

    const schoolData = {
      name: "My School",
      type: "academy",
      city: "City",
      state: "State",
      zipCode: "12345",
      created_by: dbUser.id,
      status: "active"
    };
    console.log('📋 School data to create:', schoolData);

    const schoolResult = await client.query(
      'INSERT INTO schools.schools (name, type, city, state, zip_code, created_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [
        schoolData.name,
        schoolData.type,
        schoolData.city,
        schoolData.state,
        schoolData.zipCode,
        schoolData.created_by,
        schoolData.status
      ]
    );
    const newSchool = schoolResult.rows[0];
    console.log('🚀 Created school:', newSchool);

    res.json(newSchool);
  } catch (error: any) {
    console.error("❌ Error setting up school:", error.message, error.stack);
    res.status(500).json({ message: "Error setting up school", error: error.message });
  } finally {
    if (client) {
      client.release();
      console.log('🔌 Disconnected from PostgreSQL database');
    }
  }
}

router.post("/setup-school", setupSchool);

// Get single class by ID
router.get("/classes/:id", async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    // Get the class from storage
    const classItem = classStorage.getClassById(classId);

    if (!classItem) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId || 0);

    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }

    const schoolId = userSchools[0].id;

    // Verify that the class belongs to this school
    if (Number(classItem.schoolId) !== Number(schoolId)) {
      return res.status(403).json({ message: "You don't have permission to access this class" });
    }

    // Return the class
    res.json(classItem);
  } catch (error) {
    console.error("Error fetching class:", error);
    res.status(500).json({ message: "Error fetching class" });
  }
});

// Update class by ID
router.put("/classes/:id", async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    // Get the class from storage
    const existingClass = classStorage.getClassById(classId);

    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId || 0);

    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }

    const schoolId = userSchools[0].id;

    // Verify that the class belongs to this school
    if (Number(existingClass.schoolId) !== Number(schoolId)) {
      return res.status(403).json({ message: "You don't have permission to update this class" });
    }

    // Update the class
    const updatedClass = classStorage.updateClass(classId, {
      ...req.body,
      schoolId: schoolId // Ensure the school ID doesn't change
    });

    if (!updatedClass) {
      return res.status(500).json({ message: "Failed to update class" });
    }

    console.log(`Class ${classId} updated successfully for school ${schoolId}`);

    // Return the updated class
    res.json(updatedClass);
  } catch (error) {
    console.error("Error updating class:", error);
    res.status(500).json({ message: "Error updating class" });
  }
});

// Get classes for the school
router.get("/classes", async (req, res) => {
  try {
    // For Firebase auth, directly use the hardcoded school admin connection
    // Since schooladmin@test.com is associated with American Seekers Academy (ID: 1)
    const schoolId = 1; // American Seekers Academy

    console.log(`🏫 Loading classes for school ID: ${schoolId} (American Seekers Academy)`);

    // Get raw classes from storage 
    // Read directly from the file system to ensure we get the latest data
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
    const allClasses = JSON.parse(fs.readFileSync(CLASSES_FILE, 'utf8'));

    // Filter to only include classes for this school
    const schoolClasses = allClasses.filter(cls => Number(cls.schoolId) === Number(schoolId));

    console.log(`Found ${schoolClasses.length} classes for school ID ${schoolId} (direct access)`);

    // Apply additional filters if needed
    let filteredClasses = schoolClasses;
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
      limit: schoolClasses.length,
      totalPages: 1
    });
  } catch (error) {
    console.error("Error fetching school classes:", error);
    res.status(500).json({ message: "Error fetching school classes" });
  }
});

// Get individual class by ID for editing
router.get("/classes/:id", async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    console.log('🔍 Fetching class with ID:', classId);

    // Read directly from the classes file
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

    if (!fs.existsSync(CLASSES_FILE)) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const allClasses = JSON.parse(fs.readFileSync(CLASSES_FILE, 'utf8'));
    const classData = allClasses.find((cls: any) => cls.id === classId);

    if (!classData) {
      console.log('❌ Class not found with ID:', classId);
      return res.status(404).json({ message: 'Class not found' });
    }

    console.log('✅ Class found:', classData.title);
    res.json(classData);
  } catch (error) {
    console.error('❌ Error fetching class:', error);
    res.status(500).json({ message: 'Error fetching class' });
  }
});

// Update class by ID
router.put("/classes/:id", async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    console.log('📝 Updating class with ID:', classId);
    console.log('📄 Update data:', JSON.stringify(req.body, null, 2));

    // Read classes file
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

    if (!fs.existsSync(CLASSES_FILE)) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const allClasses = JSON.parse(fs.readFileSync(CLASSES_FILE, 'utf8'));
    const classIndex = allClasses.findIndex((cls: any) => cls.id === classId);

    if (classIndex === -1) {
      console.log('❌ Class not found with ID:', classId);
      return res.status(404).json({ message: 'Class not found' });
    }

    // Update the class with new data
    const updatedClass = {
      ...allClasses[classIndex],
      title: req.body.title || allClasses[classIndex].title,
      description: req.body.description || allClasses[classIndex].description,
      category: req.body.category || allClasses[classIndex].category,
      gradeLevel: req.body.gradeLevel || allClasses[classIndex].gradeLevel,
      status: req.body.status || allClasses[classIndex].status,
      startDate: req.body.startDate || allClasses[classIndex].startDate,
      endDate: req.body.endDate || allClasses[classIndex].endDate,
      schedule: req.body.schedule || allClasses[classIndex].schedule,
      maxStudents: req.body.maxStudents || allClasses[classIndex].maxStudents,
      price: req.body.price || allClasses[classIndex].price,
      updatedAt: new Date().toISOString()
    };

    allClasses[classIndex] = updatedClass;

    // Write back to file
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(allClasses, null, 2));

    console.log('✅ Class updated successfully:', updatedClass.title);
    res.json(updatedClass);
  } catch (error) {
    console.error('❌ Error updating class:', error);
    res.status(500).json({ message: 'Error updating class' });
  }
});

// Staff file management functions
const STAFF_FILE = path.join(process.cwd(), 'data', 'staff.json');

function loadStaffMembers() {
  try {
    if (fs.existsSync(STAFF_FILE)) {
      const data = fs.readFileSync(STAFF_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Error loading staff members:', error);
  }
  return [];
}

function saveStaffMembers(staff: any[]) {
  try {
    const dataDir = path.dirname(STAFF_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 2));
    console.log('Staff members saved successfully');
  } catch (error) {
    console.error('Error saving staff members:', error);
  }
}

// Invite staff member (POST endpoint) - bypassing auth for now
router.post("/staff/invite", async (req, res) => {
  // Skip authentication for staff invitation to fix the HTML redirect issue
  console.log("🚨 DEBUG: Staff invitation endpoint hit!");
  console.log("🚨 DEBUG: Request method:", req.method);
  console.log("🚨 DEBUG: Request URL:", req.url);
  console.log("🚨 DEBUG: Request body:", req.body);
  console.log("🚨 DEBUG: Request headers:", req.headers);

  try {
    console.log("📧 Staff invitation request received:", req.body);
    const { email, firstName, lastName, role, department, message } = req.body;

    if (!email || !firstName || !lastName || !role || !department) {
      console.log("❌ Missing required fields:", { email, firstName, lastName, role, department });
      return res.status(400).json({ message: "Missing required fields" });
    }

    const staffMembers = loadStaffMembers();
    console.log("📋 Current staff members count:", staffMembers.length);

    // Check if staff member already exists
    const existingStaff = staffMembers.find(s => s.email === email);
    if (existingStaff) {
      console.log("❌ Staff member already exists:", email);
      return res.status(400).json({ message: "Staff member with this email already exists" });
    }

    // Try to save to database first, fallback to file storage
    try {
      // Get authorization header for Supabase
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        
        // Create Supabase client with user's access token
        const { createClient } = await import('@supabase/supabase-js');
        
        if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
              global: {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            }
          );

          // Insert into database
          const { data: dbStaff, error: dbError } = await supabase
            .from('school_staff')
            .insert({
              school_id: 1,
              first_name: firstName,
              last_name: lastName,
              email: email,
              position: role,
              department: department,
              is_active: true,
              permissions: {},
              start_date: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (!dbError && dbStaff) {
            console.log("✅ Staff member saved to database:", dbStaff);
            
            // Transform to match frontend format
            const responseStaff = {
              id: dbStaff.id,
              email: dbStaff.email,
              firstName: dbStaff.first_name,
              lastName: dbStaff.last_name,
              name: `${dbStaff.first_name} ${dbStaff.last_name}`,
              role: dbStaff.position,
              department: dbStaff.department,
              status: "Active",
              joinDate: dbStaff.start_date?.split('T')[0] || new Date().toISOString().split('T')[0],
              avatar: "",
              phone: "",
              subjects: [],
              invitedAt: dbStaff.created_at,
              message: message || ""
            };

            // Send invitation email
            const emailSent = await sendStaffInvitationEmail(email, firstName, lastName, role, department, message);
            
            return res.json({ 
              success: true, 
              message: emailSent ? "Staff member invited successfully and invitation email sent" : "Staff member invited successfully (email not sent)",
              staff: responseStaff,
              emailSent 
            });
          } else {
            console.log("Database insert failed, using file storage fallback:", dbError?.message);
          }
        }
      }
    } catch (dbError) {
      console.log("Database operation failed, using file storage fallback:", dbError);
    }

    // Fallback to file storage
    const newStaffMember = {
      id: Math.max(0, ...staffMembers.map(s => s.id || 0)) + 1,
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      role,
      department,
      status: "Pending",
      joinDate: new Date().toISOString().split('T')[0],
      avatar: "",
      phone: "",
      subjects: [],
      invitedAt: new Date().toISOString(),
      message: message || ""
    };

    staffMembers.push(newStaffMember);
    saveStaffMembers(staffMembers);

    console.log("✅ New staff member invited successfully (file storage):", newStaffMember);
    console.log("📋 Updated staff members count:", staffMembers.length);

    // Send invitation email
    const emailSent = await sendStaffInvitationEmail(email, firstName, lastName, role, department, message);

    res.json({ 
      success: true, 
      message: emailSent ? "Staff member invited successfully and invitation email sent" : "Staff member invited successfully (email not sent)",
      staff: newStaffMember,
      emailSent 
    });
  } catch (error) {
    console.error("❌ Error inviting staff member:", error);
    res.status(500).json({ message: "Error inviting staff member", error: error.message });
  }
});

// Get staff members for the school
router.get("/staff", async (req, res) => {
  try {
    // For Firebase auth, directly use the hardcoded school admin connection
    // Since schooladmin@test.com is associated with American Seekers Academy (ID: 1)
    const schoolId = 1; // American Seekers Academy

    console.log(`👥 Loading staff for school ID: ${schoolId} (American Seekers Academy)`);

    // Get staff directly from the file system to ensure we get the latest data
    const DATA_DIR = path.join(process.cwd(), 'data');
    const STAFF_FILE = path.join(DATA_DIR, 'staff.json');
    
    if (!fs.existsSync(STAFF_FILE)) {
      console.log('No staff file found, returning empty array');
      return res.json([]);
    }
    
    const allStaff = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
    
    console.log(`Found ${allStaff.length} staff members (direct access)`);
    
    // Return the staff list
    res.json(allStaff);
  } catch (error) {
    console.error("Error fetching school staff:", error);
    res.status(500).json({ message: "Error fetching school staff" });
  }
});

// Get single staff member by ID
router.get("/staff/:id", async (req, res) => {
  try {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // Sample staff data - in a real app this would come from database
    const sampleStaff = [
      {
        id: 1,
        name: "Dr. Sarah Johnson",
        email: "sarah.johnson@example.com",
        phone: "(555) 123-4567",
        role: "Teacher",
        department: "History",
        subjects: ["U.S. History", "World History"],
        status: "Active",
        joinDate: "2021-08-15",
        avatar: "",
      },
      {
        id: 2,
        name: "Prof. Michael Chen",
        email: "michael.chen@example.com",
        phone: "(555) 234-5678",
        role: "Teacher",
        department: "Mathematics",
        subjects: ["Calculus", "Algebra"],
        status: "Active",
        joinDate: "2020-09-01",
        avatar: "",
      }
    ];

    const staffMember = sampleStaff.find(s => s.id === staffId);
    if (!staffMember) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    res.json(staffMember);
  } catch (error) {
    console.error("Error fetching staff member:", error);
    res.status(500).json({ message: "Error fetching staff member" });
  }
});

// Update staff member
router.put("/staff/:id", async (req, res) => {
  try {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    const { name, email, phone, role, department, status } = req.body;

    // In a real app, this would update the database
    console.log(`🔄 Updating staff member ${staffId}:`, { name, email, role, department, status });

    const updatedStaff = {
      id: staffId,
      name,
      email,
      phone,
      role,
      department,
      subjects: [], // Would be handled separately
      status,
      joinDate: "2021-08-15", // Keep existing date
      avatar: "",
    };

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
router.delete("/staff/:id", async (req, res) => {
  try {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID format" });
    }

    // In a real app, this would remove from database
    console.log(`🗑️ Removing staff member ${staffId}`);

    res.json({ 
      success: true, 
      message: "Staff member removed successfully" 
    });
  } catch (error) {
    console.error("Error removing staff member:", error);
    res.status(500).json({ message: "Error removing staff member" });
  }
});

// Initialize staff positions storage with file persistence
const STAFF_POSITIONS_FILE = path.join(process.cwd(), 'data', 'staff-positions.json');

// Load positions from file
function loadStaffPositions() {
  try {
    if (fs.existsSync(STAFF_POSITIONS_FILE)) {
      const data = fs.readFileSync(STAFF_POSITIONS_FILE, 'utf8');
      const positions = JSON.parse(data);
      console.log('Loaded staff positions from file:', positions.map(p => p.title));
      return positions;
    }
  } catch (error) {
    console.log('Error loading staff positions:', error);
  }
  // Fallback to defaults if file doesn't exist
  return [
    { id: 1, title: "Teacher", description: "Classroom instructor", isDefault: true },
    { id: 2, title: "Teacher Assistant", description: "Supports classroom instruction", isDefault: true },
    { id: 3, title: "Administrator", description: "School administration", isDefault: true },
    { id: 4, title: "Support Staff", description: "General support roles", isDefault: false },
    { id: 5, title: "Volunteer", description: "Volunteer position", isDefault: false },
    { id: 6, title: "Substitute Teacher", description: "Temporary classroom instructor", isDefault: false },
    { id: 7, title: "Counselor", description: "Student guidance and support", isDefault: false },
    { id: 8, title: "Librarian", description: "Library management", isDefault: false },
  ];
}

// Save positions to file
function saveStaffPositions(positions: any[]) {
  try {
    const dataDir = path.dirname(STAFF_POSITIONS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(STAFF_POSITIONS_FILE, JSON.stringify(positions, null, 2));
    console.log('Staff positions saved to file successfully');
  } catch (error) {
    console.error('Error saving staff positions:', error);
  }
}

let staffPositions = loadStaffPositions();

// Get staff positions/roles for dropdown
router.get("/staff-positions", async (req, res) => {
  try {
    res.json(staffPositions);
  } catch (error) {
    console.error("Error fetching staff positions:", error);
    res.status(500).json({ message: "Error fetching staff positions" });
  }
});

// Create new staff position
router.post("/staff-positions", async (req, res) => {
  try {
    const { title, description, isDefault } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const newPosition = {
      id: Math.max(...staffPositions.map(p => p.id)) + 1,
      title,
      description: description || "",
      isDefault: isDefault || false
    };

    staffPositions.push(newPosition);
    saveStaffPositions(staffPositions);
    console.log("Created new staff position:", newPosition);

    res.json(newPosition);
  } catch (error) {
    console.error("Error creating staff position:", error);
    res.status(500).json({ message: "Error creating staff position" });
  }
});

// Update staff position  
router.patch("/staff-positions/:id", async (req, res) => {
  console.log("🚨 PATCH ENDPOINT HIT! ID:", req.params.id);
  console.log("🚨 REQUEST BODY:", req.body);

  try {
    const positionId = parseInt(req.params.id);
    const { title, description, isDefault } = req.body;

    console.log("🔧 PATCH /staff-positions/" + positionId + " received:", { title, description, isDefault });
    console.log("📋 Current staffPositions before update:", staffPositions);

    const positionIndex = staffPositions.findIndex(p => p.id === positionId);

    if (positionIndex === -1) {
      console.log("❌ Position not found for ID:", positionId);
      return res.status(404).json({ message: "Staff position not found" });
    }

    // Update the position
    const updatedPosition = {
      ...staffPositions[positionIndex],
      title: title || staffPositions[positionIndex].title,
      description: description !== undefined ? description : staffPositions[positionIndex].description,
      isDefault: isDefault !== undefined ? isDefault : staffPositions[positionIndex].isDefault
    };

    staffPositions[positionIndex] = updatedPosition;
    saveStaffPositions(staffPositions);

    console.log("✅ Successfully updated staff position:", updatedPosition);
    console.log("📋 Full staffPositions after update:", staffPositions);

    res.json(updatedPosition);
  } catch (error) {
    console.error("❌ Error updating staff position:", error);
    res.status(500).json({ message: "Error updating staff position" });
  }
});

// Delete staff position
router.delete("/staff-positions/:id", async (req, res) => {
  try {
    const positionId = parseInt(req.params.id);
    const positionIndex = staffPositions.findIndex(p => p.id === positionId);

    if (positionIndex === -1) {
      return res.status(404).json({ message: "Staff position not found" });
    }

    const deletedPosition = staffPositions.splice(positionIndex, 1)[0];
    saveStaffPositions(staffPositions);
    console.log("Deleted staff position:", deletedPosition);

    res.json({ message: "Staff position deleted successfully" });
  } catch (error) {
    console.error("Error deleting staff position:", error);
    res.status(500).json({ message: "Error deleting staff position" });
  }
});

// Get departments for dropdown
router.get("/departments", async (req, res) => {
  try {
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
router.get("/students", async (req, res) => {
  try {
    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId);

    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }

    // For now, return sample student data
    // In a real implementation, this would come from the database
    const sampleStudents = [
      {
        id: 1,
        name: "Emma Thompson",
        gradeLevel: "9",
        age: 15,
        parentName: "James and Sarah Thompson",
        email: "thompson.family@example.com",
        enrollmentDate: "2023-08-10",
        status: "Active",
        classes: ["Introduction to American History", "Advanced Mathematics", "Biology and Ecosystems"],
        avatar: "",
      },
      {
        id: 2,
        name: "Michael Rodriguez",
        gradeLevel: "10",
        age: 16,
        parentName: "Carlos and Maria Rodriguez",
        email: "rodriguez.family@example.com",
        enrollmentDate: "2022-08-15",
        status: "Active",
        classes: ["Advanced Mathematics", "Biology and Ecosystems", "Beginner Spanish"],
        avatar: "",
      }
    ];

    res.json(sampleStudents);
  } catch (error) {
    console.error("Error fetching school students:", error);
    res.status(500).json({ message: "Error fetching school students" });
  }
});

// Create a new class for a school
router.post("/classes", async (req, res) => {
  try {
    console.log('📝 Creating new class:', JSON.stringify(req.body, null, 2));
    
    // Read classes file
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Load existing classes or initialize empty array
    let existingClasses = [];
    if (fs.existsSync(CLASSES_FILE)) {
      try {
        const fileContent = fs.readFileSync(CLASSES_FILE, 'utf8');
        existingClasses = JSON.parse(fileContent);
      } catch (error) {
        console.log('Error reading classes file, starting with empty array:', error);
        existingClasses = [];
      }
    }

    // Generate new ID
    const newId = existingClasses.length > 0 
      ? Math.max(...existingClasses.map((c: any) => c.id)) + 1 
      : 1;

    // Find instructor details from staff
    const staffMembers = loadStaffMembers();
    const instructor = staffMembers.find((s: any) => s.name === req.body.instructorName);

    // Create new class object
    const newClass = {
      id: newId,
      schoolId: 1, // Default to American Seekers Academy
      title: req.body.title,
      description: req.body.description,
      category: req.body.category || 'Academic',
      gradeLevel: req.body.gradeLevel,
      status: req.body.status || 'upcoming',
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      schedule: req.body.schedule,
      capacity: req.body.capacity || 10,
      maxStudents: req.body.capacity || 10,
      enrollmentCount: 0,
      location: req.body.location,
      price: req.body.price || 0,
      instructorName: req.body.instructorName,
      instructorId: instructor ? instructor.id : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add to classes array
    existingClasses.push(newClass);

    // Write back to file
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(existingClasses, null, 2));

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
router.patch("/schools/:id", async (req, res) => {
  console.log('🔥 PATCH request received in school-admin router');
  console.log('🔥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('🔥 School ID:', req.params.id);
  try {
    const schoolId = parseInt(req.params.id);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "No authorization header" });
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a new Supabase client instance with the user's access token
    const { createClient } = await import('@supabase/supabase-js');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return res.status(500).json({ message: "Supabase configuration missing" });
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
      console.error('Auth error:', authError);
      return res.status(401).json({ message: "Invalid token" });
    }

    console.log('✅ Authenticated user for school update:', user.email);

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
      enrollment_size: updateData.enrollmentSize,
      updated_at: new Date().toISOString()
    };

    // Remove undefined fields
    Object.keys(dbUpdateData).forEach(key => {
      if (dbUpdateData[key] === undefined) {
        delete dbUpdateData[key];
      }
    });

    console.log('🔄 Updating school in database with data:', JSON.stringify(dbUpdateData, null, 2));
    console.log('🔄 Updating school ID:', schoolId);

    // Update the school in the database
    const { data: updatedSchool, error: updateError } = await supabaseAdmin
      .from('schools')
      .update(dbUpdateData)
      .eq('id', schoolId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      return res.status(500).json({ 
        message: "Failed to update school",
        error: updateError.message
      });
    }

    if (!updatedSchool) {
      console.error('❌ No school data returned after update');
      return res.status(500).json({ 
        message: "School update failed - no data returned"
      });
    }

    console.log('✅ School updated successfully:', updatedSchool.name);
    console.log('✅ Updated school data:', JSON.stringify(updatedSchool, null, 2));

    return res.json({
      message: "School updated successfully",
      school: updatedSchool,
    });
  } catch (error) {
    console.error("Error updating school:", error);
    return res.status(500).json({ message: "Server error while updating school" });
  }
});

router.get("/knowledge-bases", async (req, res) => {
  try {
    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId);

    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }

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

// Get individual student endpoint
router.get('/students/:id', async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    console.log('🎓 Fetching individual student by ID:', studentId);

    // Read students from file
    const childrenPath = path.join(process.cwd(), 'data', 'children.json');
    const childrenData = JSON.parse(fs.readFileSync(childrenPath, 'utf8'));

    const student = childrenData.find((child: any) => child.id === studentId);

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
router.put('/students/:id', async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const updateData = req.body;

    console.log('Updating student:', studentId, updateData);

    // Get existing student
    const existingStudent = await storage.getStudentById(studentId);
    if (!existingStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update student with new data
    const updatedStudent = await storage.updateStudent(studentId, {
      firstName: updateData.firstName,
      lastName: updateData.lastName,
      birthdate: updateData.dateOfBirth,
      gradeLevel: updateData.gradeLevel,
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

export default router;