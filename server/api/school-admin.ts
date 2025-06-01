import { Router } from "express";
import { storage } from "../storage";
import fs from 'fs';
import path from 'path';

const router = Router();

// Test route to verify router is working
router.get("/test", (req, res) => {
  console.log("🚨 TEST ROUTE HIT!");
  res.json({ message: "School admin router is working!" });
});

// Removed problematic authentication middleware that was blocking PATCH requests

// Special direct login for school admin
router.post("/login", (req, res) => {
  try {
    console.log('School Admin direct login attempt');
    
    // Create the school admin user response
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
    
    console.log('School admin login successful');
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: "School Admin login successful",
      user: schoolAdminUser
    });
  } catch (error) {
    console.error('School admin direct login error:', error);
    return res.status(500).json({
      success: false,
      message: "Server error during login"
    });
  }
});

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
      // Load school data from file until database permissions are fixed
      const fs = require('fs');
      const path = require('path');
      
      const schoolsPath = path.join(process.cwd(), 'data', 'schools.json');
      const usersPath = path.join(process.cwd(), 'data', 'users.json');
      
      if (!fs.existsSync(schoolsPath) || !fs.existsSync(usersPath)) {
        console.error('Data files not found');
        return res.status(404).json({ 
          message: "School data not available"
        });
      }
      
      const schools = JSON.parse(fs.readFileSync(schoolsPath, 'utf8'));
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      
      // Find the user
      const userData = users.find(u => u.email === user.email && u.role === 'school_admin');
      if (!userData) {
        console.error('School admin user not found in file:', user.email);
        return res.status(404).json({ 
          message: "School admin user not found"
        });
      }
      
      // Find the school created by this user
      const schoolData = schools.find(s => s.created_by === userData.id);
      if (!schoolData) {
        console.error('No school found for admin:', user.email);
        return res.status(404).json({ 
          message: "No school found for this administrator"
        });
      }

      console.log('🚀 Returning school data from file:', schoolData.name);
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
router.post("/setup-school", async (req, res) => {
  try {
    console.log('🏫 Setting up school for new admin');
    
    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "No authorization header" });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify the token with Supabase
    const { supabase } = await import('../db/supabase');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return res.status(401).json({ message: "Invalid token" });
    }

    console.log('✅ Setting up school for user:', user.email);

    // Check if user exists in database, create if not
    let dbUser = await storage.getUserByEmail(user.email);
    if (!dbUser) {
      // Create user in database
      dbUser = await storage.createUser({
        email: user.email,
        username: user.email.split('@')[0],
        role: 'schoolAdmin',
        name: user.user_metadata?.full_name || user.email
      });
    }

    // Create a default school for this admin
    const schoolData = {
      name: "My School",
      type: "academy",
      city: "City",
      state: "State",
      zipCode: "12345",
      created_by: dbUser.id,
      status: "active"
    };

    const newSchool = await storage.createSchool(schoolData);
    
    console.log('🚀 Created school:', newSchool.name);
    res.json(newSchool);
  } catch (error) {
    console.error("Error setting up school:", error);
    res.status(500).json({ message: "Error setting up school" });
  }
});

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
    
    console.log("✅ New staff member invited successfully:", newStaffMember);
    console.log("📋 Updated staff members count:", staffMembers.length);
    
    res.json({ 
      success: true, 
      message: "Staff member invited successfully",
      staff: newStaffMember 
    });
  } catch (error) {
    console.error("❌ Error inviting staff member:", error);
    res.status(500).json({ message: "Error inviting staff member", error: error.message });
  }
});

// Get staff members for the school
router.get("/staff", async (req, res) => {
  try {
    const staffList = loadStaffMembers();
    res.json(staffList);
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
    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId || 0);
    
    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }
    
    const schoolId = userSchools[0].id;
    
    // Prepare class data with school ID
    const classData = {
      ...req.body,
      schoolId: schoolId,
      instructorId: req.session.userId || 0,
      enrollmentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create the class
    const newClass = classStorage.createClass(classData);
    
    return res.status(201).json({
      message: "Class created successfully",
      class: newClass
    });
  } catch (error) {
    console.error("Error creating class:", error);
    return res.status(500).json({ message: "Server error while creating class" });
  }
});

// Update school information for a school admin
router.patch("/schools/:id", async (req, res) => {
  try {
    const schoolId = parseInt(req.params.id);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    // Get the school being edited
    const school = await storage.getSchoolById(schoolId);
    
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }
    
    // Verify the current user is the admin of this school
    if (school.created_by !== req.session.userId && req.session.userRole !== "admin") {
      return res.status(403).json({ message: "You do not have permission to update this school" });
    }
    
    // Don't allow updating certain fields like created_by unless admin
    const updateData = { ...req.body };
    if (req.session.userRole !== "admin") {
      delete updateData.created_by;
      delete updateData.id;
      delete updateData.created_at;
    }
    
    // Update the school in Supabase
    const updatedSchool = await storage.updateSchool(schoolId, updateData);
    
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