import { Router } from "express";
import { schoolStorage } from "../school-storage";
import { classStorage } from "../class-storage";

const router = Router();

// Authentication middleware for school admin routes
const requireSchoolAdmin = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (req.session.userRole !== "schoolAdmin" && req.session.userRole !== "admin") {
    return res.status(403).json({ message: "Forbidden: Only school administrators can access this resource" });
  }
  
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
    // Get schools administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId);
    
    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }
    
    // Return the first school (most school admins will only manage one school)
    res.json(userSchools[0]);
  } catch (error) {
    console.error("Error fetching school information:", error);
    res.status(500).json({ message: "Error fetching school information" });
  }
});

// Get classes for the school
router.get("/classes", requireSchoolAdmin, async (req, res) => {
  try {
    // Get the school(s) administered by this user
    const userSchools = schoolStorage.getSchoolsByAdminId(req.session.userId);
    
    if (userSchools.length === 0) {
      return res.status(404).json({ message: "No schools found for this administrator" });
    }
    
    const schoolId = userSchools[0].id;
    
    // Get all classes (will need to be filtered for schoolId in a real implementation)
    const classes = classStorage.getClasses({
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      search: req.query.search as string || '',
      category: req.query.category as string || '',
      status: req.query.status as string || ''
    });
    
    res.json(classes);
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