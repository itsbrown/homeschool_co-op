import { Router } from "express";
import { db } from "../db";
import { schools, users, insertSchoolSchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { schoolStorage } from "../school-storage";
import { storage } from "../storage";

const router = Router();

// Create a new school
router.post("/", async (req, res) => {
  const { session } = req;
  try {
    // Check if user is authenticated and is an admin
    if (!session?.userId) {
      return res.status(401).json({ message: "You must be logged in to register a school" });
    }
    
    // Check if user has permission to register schools (admin or schoolAdmin)
    if (session.userRole !== 'admin' && session.userRole !== 'schoolAdmin') {
      return res.status(403).json({ message: "Only administrators can register schools" });
    }

    // Validate the request body
    const validatedData = insertSchoolSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ 
        message: "Invalid school data", 
        errors: validatedData.error.errors 
      });
    }

    // Set user as school admin
    const schoolData = validatedData.data;
    
    // Check if user is already an admin of another school in file storage
    const existingSchools = schoolStorage.getSchoolsByAdminId(session.userId);
    if (existingSchools.length > 0) {
      return res.status(400).json({
        message: "You are already registered as an administrator of a school",
      });
    }
    
    // Check if a school with the same name already exists in file storage
    const allSchools = schoolStorage.getSchools();
    const schoolWithSameName = allSchools.find(s => s.name === schoolData.name);
    
    if (schoolWithSameName) {
      return res.status(400).json({
        message: "A school with this name is already registered",
      });
    }
    
    // Create school in file storage
    const createdSchool = schoolStorage.createSchool({
      ...schoolData,
      adminId: session.userId
    });
    
    return res.status(201).json({
      message: "School registration submitted successfully",
      school: createdSchool,
    });
  } catch (error) {
    console.error("Error registering school:", error);
    return res.status(500).json({ message: "Server error while registering school" });
  }
});

// Get all schools (admin only)
router.get("/", async (req, res) => {
  const { session } = req;
  try {
    // Check if user is authenticated and is an admin
    if (!session?.userId || session.userRole !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const allSchools = await db.query.schools.findMany({
      orderBy: schools.name,
    });

    return res.json(allSchools);
  } catch (error) {
    console.error("Error fetching schools:", error);
    return res.status(500).json({ message: "Server error while fetching schools" });
  }
});

// Get a school by ID
router.get("/:id", async (req, res) => {
  const { session } = req;
  const { id } = req.params;
  
  try {
    // Check if user is authenticated
    if (!session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schoolId = parseInt(id);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId)
    });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Check if user is admin or the admin of this school
    if (session.userRole !== "admin" && school.adminId !== session.userId) {
      return res.status(403).json({ message: "You do not have permission to view this school" });
    }

    return res.json(school);
  } catch (error) {
    console.error("Error fetching school:", error);
    return res.status(500).json({ message: "Server error while fetching school" });
  }
});

// Update a school
router.patch("/:id", async (req, res) => {
  const { session } = req;
  const { id } = req.params;
  
  try {
    // Check if user is authenticated
    if (!session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schoolId = parseInt(id);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId)
    });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Only allow admin or the school's admin to update
    if (session.userRole !== "admin" && school.adminId !== session.userId) {
      return res.status(403).json({ message: "You do not have permission to update this school" });
    }
    
    // Don't allow updating certain fields like adminId, status, isVerified unless admin
    const updateData = { ...req.body };
    if (session.userRole !== "admin") {
      delete updateData.adminId;
      delete updateData.status;
      delete updateData.isVerified;
    }

    // Update in database if available
    let updatedSchool;
    try {
      [updatedSchool] = await db.update(schools)
        .set({ 
          ...updateData,
          updatedAt: new Date(), 
        })
        .where(eq(schools.id, schoolId))
        .returning();
    } catch (dbError) {
      console.error("Database update failed, falling back to file storage:", dbError);
    }
    
    // Also update in file-based storage since that's what the UI uses
    const fileUpdatedSchool = schoolStorage.updateSchool(schoolId, updateData);
    
    return res.json({
      message: "School updated successfully",
      school: updatedSchool || fileUpdatedSchool,
    });
  } catch (error) {
    console.error("Error updating school:", error);
    return res.status(500).json({ message: "Server error while updating school" });
  }
});

// Get schools administered by current user
router.get("/user/admin", async (req, res) => {
  const { session } = req;
  
  try {
    // Check if user is authenticated
    if (!session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userSchools = await db.query.schools.findMany({
      where: eq(schools.adminId, session.userId)
    });

    return res.json(userSchools);
  } catch (error) {
    console.error("Error fetching user's schools:", error);
    return res.status(500).json({ message: "Server error while fetching user's schools" });
  }
});

// Get students for school admin (bypass authentication)
router.get("/students", async (req, res) => {
  console.log('📚 Fetching students from database...');
  
  try {
    // Get all children from storage
    const children = await storage.getAllChildren();
    console.log(`📚 Found ${children.length} children in storage:`, children.map(c => c.firstName + ' ' + c.lastName));
    
    // If no children found, try loading directly from file as fallback
    if (children.length === 0) {
      console.log('⚠️ No children found in storage, trying direct file access...');
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../../data/children.json');
      
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf-8');
        const fileChildren = JSON.parse(fileData);
        console.log(`📁 Found ${fileChildren.length} children in file:`, fileChildren.map(c => c.firstName + ' ' + c.lastName));
        
        // Use file data if available
        const students = fileChildren.map(child => ({
          id: child.id,
          name: `${child.firstName} ${child.lastName}`,
          gradeLevel: child.gradeLevel || 'N/A',
          age: child.birthdate ? Math.floor((Date.now() - new Date(child.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A',
          parentName: 'Parent Contact',
          email: 'No email',
          enrollmentDate: child.createdAt ? new Date(child.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          status: 'Active',
          classes: [],
          avatar: '',
        }));
        
        console.log(`📚 Returning ${students.length} students from file:`, students.map(s => s.name));
        return res.json(students);
      }
    }
    
    // Transform children data to match students format
    const students = children.map(child => ({
      id: child.id,
      name: `${child.firstName} ${child.lastName}`,
      gradeLevel: child.gradeLevel || 'N/A',
      age: child.birthdate ? Math.floor((Date.now() - new Date(child.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A',
      parentName: 'Parent Contact', // Will be enhanced later with actual parent lookup
      email: 'No email', // Parent email lookup will be added later
      enrollmentDate: child.createdAt ? new Date(child.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      status: 'Active',
      classes: [],
      avatar: '',
    }));
    
    console.log(`📚 Returning ${students.length} students:`, students.map(s => s.name));
    res.json(students);
  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students', error: error.message });
  }
});

export default router;