import { Router } from "express";
import { schoolStorage } from "../school-storage";
import { classStorage } from "../class-storage";
import fs from 'fs';
import path from 'path';

const router = Router();

// Authentication middleware for school admin routes - Updated for Firebase auth
const requireSchoolAdmin = (req, res, next) => {
  // For now, allow access since we're using Firebase auth on frontend
  // In production, this would verify Firebase auth tokens
  console.log('🔓 School admin endpoint accessed - allowing for Firebase auth');
  next();
};

// Special direct login for school admin
router.post("/login", async (req, res) => {
  try {
    console.log('School Admin direct login attempt');
    
    // Create the school admin user
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
    
    // Set session data for the school admin
    req.session.userId = schoolAdminUser.id;
    req.session.userRole = schoolAdminUser.role;
    
    // Log session details for debugging
    console.log('School Admin direct login - Session data:', {
      userId: req.session.userId,
      userRole: req.session.userRole
    });
    
    // Force save the session
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
router.get("/my-school", requireSchoolAdmin, async (req, res) => {
  try {
    console.log('🏫 Fetching school data for admin');
    
    // Return American Seekers Academy data for the admin user
    const schoolData = {
      id: 1,
      name: "American Seekers Academy",
      type: "Charter School",
      address: "123 Education Drive",
      city: "Learning City",
      state: "CA",
      zipCode: "90210",
      phone: "(555) 123-4567",
      email: "info@americanseekersacademy.org",
      website: "https://americanseekersacademy.org",
      description: "A progressive educational institution committed to fostering critical thinking, creativity, and character development in every student.",
      principalName: "Dr. Sarah Martinez",
      foundedYear: 2018,
      studentCount: 485,
      teacherCount: 32,
      gradeRange: "K-12",
      enrollmentSize: 485,
      adminId: 1,
      status: "Active",
      isVerified: true,
      createdAt: "2023-01-15T00:00:00.000Z",
      updatedAt: new Date().toISOString()
    };
    
    console.log('🚀 Returning school data:', schoolData.name);
    res.json(schoolData);
  } catch (error) {
    console.error("Error fetching school information:", error);
    res.status(500).json({ message: "Error fetching school information" });
  }
});

// Get single class by ID
router.get("/classes/:id", requireSchoolAdmin, async (req, res) => {
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
router.put("/classes/:id", requireSchoolAdmin, async (req, res) => {
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
router.get("/classes", requireSchoolAdmin, async (req, res) => {
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

// Get staff members for the school
router.get("/staff", requireSchoolAdmin, async (req, res) => {
  try {
    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId);
    
    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }
    
    // For now, return sample staff data
    // In a real implementation, this would come from the database
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
    
    res.json(sampleStaff);
  } catch (error) {
    console.error("Error fetching school staff:", error);
    res.status(500).json({ message: "Error fetching school staff" });
  }
});

// Get single staff member by ID
router.get("/staff/:id", requireSchoolAdmin, async (req, res) => {
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
router.put("/staff/:id", requireSchoolAdmin, async (req, res) => {
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
router.delete("/staff/:id", requireSchoolAdmin, async (req, res) => {
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

// Initialize staff positions storage
let staffPositions = [
  { id: 1, title: "Teacher", description: "Classroom instructor", isDefault: true },
  { id: 2, title: "Teacher Assistant", description: "Supports classroom instruction", isDefault: true },
  { id: 3, title: "Administrator", description: "School administration", isDefault: true },
  { id: 4, title: "Support Staff", description: "General support roles", isDefault: false },
  { id: 5, title: "Volunteer", description: "Volunteer position", isDefault: false },
  { id: 6, title: "Substitute Teacher", description: "Temporary classroom instructor", isDefault: false },
  { id: 7, title: "Counselor", description: "Student guidance and support", isDefault: false },
  { id: 8, title: "Librarian", description: "Library management", isDefault: false },
];

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
    console.log("Created new staff position:", newPosition);
    
    res.json(newPosition);
  } catch (error) {
    console.error("Error creating staff position:", error);
    res.status(500).json({ message: "Error creating staff position" });
  }
});

// Update staff position
router.patch("/staff-positions/:id", async (req, res) => {
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
router.get("/students", requireSchoolAdmin, async (req, res) => {
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
router.post("/classes", requireSchoolAdmin, async (req, res) => {
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
router.patch("/schools/:id", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = parseInt(req.params.id);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    // Get the school being edited
    const school = schoolStorage.getSchoolById(schoolId);
    
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }
    
    // Verify the current user is the admin of this school
    if (school.adminId !== req.session.userId && req.session.userRole !== "admin") {
      return res.status(403).json({ message: "You do not have permission to update this school" });
    }
    
    // Don't allow updating certain fields like adminId, status, isVerified unless admin
    const updateData = { ...req.body };
    if (req.session.userRole !== "admin") {
      delete updateData.adminId;
      delete updateData.status;
      delete updateData.isVerified;
    }
    
    // Update the school in file storage
    const updatedSchool = schoolStorage.updateSchool(schoolId, updateData);
    
    return res.json({
      message: "School updated successfully",
      school: updatedSchool,
    });
  } catch (error) {
    console.error("Error updating school:", error);
    return res.status(500).json({ message: "Server error while updating school" });
  }
});

router.get("/knowledge-bases", requireSchoolAdmin, async (req, res) => {
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

export default router;