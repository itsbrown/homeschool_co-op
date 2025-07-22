import express from "express";
import { db } from "../db";
import { schools, children } from "@shared/schema";
import { insertSchoolSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Generate a unique registration code
function generateRegistrationCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Create a new school
router.post("/", async (req, res) => {
  try {
    console.log('🏫 Creating school with data:', JSON.stringify(req.body, null, 2));
    
    // Validate the request body
    const validatedData = insertSchoolSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ 
        message: "Invalid school data", 
        errors: validatedData.error.issues 
      });
    }

    // Generate unique registration code if not provided
    const registrationCode = validatedData.data.registrationCode || generateRegistrationCode();
    const schoolDataWithCode = {
      ...validatedData.data,
      registrationCode
    };

    try {
      // Try database first
      const [newSchool] = await db
        .insert(schools)
        .values(schoolDataWithCode)
        .returning();

      console.log('✅ School created in database:', newSchool);
      res.status(201).json(newSchool);
    } catch (dbError) {
      console.log('⚠️ Database failed, using file storage fallback:', dbError);
      
      // Fallback to file storage
      const fs = await import('fs');
      const path = await import('path');
      
      const DATA_DIR = path.join(process.cwd(), 'data');
      const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');

      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Load existing schools or initialize empty array
      let existingSchools = [];
      if (fs.existsSync(SCHOOLS_FILE)) {
        try {
          const fileContent = fs.readFileSync(SCHOOLS_FILE, 'utf8');
          existingSchools = JSON.parse(fileContent);
        } catch (error) {
          console.log('Error reading schools file, starting with empty array:', error);
          existingSchools = [];
        }
      }

      // Generate new ID
      const newId = existingSchools.length > 0 
        ? Math.max(...existingSchools.map((s: any) => s.id)) + 1 
        : 1;

      // Create new school object for file storage
      const newSchool = {
        id: newId,
        name: schoolDataWithCode.name,
        type: schoolDataWithCode.type,
        address: schoolDataWithCode.address,
        city: schoolDataWithCode.city,
        state: schoolDataWithCode.state,
        zipCode: schoolDataWithCode.zipCode,
        phoneNumber: schoolDataWithCode.phoneNumber,
        email: schoolDataWithCode.email,
        website: schoolDataWithCode.website,
        description: schoolDataWithCode.description,
        accreditation: schoolDataWithCode.accreditation,
        enrollmentSize: schoolDataWithCode.enrollmentSize,
        foundedYear: schoolDataWithCode.foundedYear,
        registrationCode: schoolDataWithCode.registrationCode,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Add to schools array
      existingSchools.push(newSchool);

      // Write back to file
      fs.writeFileSync(SCHOOLS_FILE, JSON.stringify(existingSchools, null, 2));

      console.log('✅ School created successfully in file storage:', newSchool.name);
      res.status(201).json(newSchool);
    }
  } catch (error: any) {
    console.error("Error creating school:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get all schools
router.get("/", async (req, res) => {
  try {
    const allSchools = await db.query.schools.findMany();
    res.json(allSchools);
  } catch (error: any) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get knowledge bases - must be before /:id route to avoid conflicts
router.get("/knowledge-bases", async (req, res) => {
  try {
    // Return sample knowledge base data for now
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
      },
      {
        id: 3,
        title: "Science Laboratory Experiments",
        description: "Hands-on laboratory experiments for high school chemistry and physics classes.",
        subjectArea: "Science",
        gradeLevel: ["9-12"],
        status: "Published",
        visibility: "School",
        fileCount: 28,
        size: "156 MB",
        createdAt: "2023-07-12",
        updatedAt: "2023-10-05",
        tags: ["Science", "Chemistry", "Physics", "Laboratory"],
        creator: "Dr. Emily Rodriguez",
        rating: 4.7,
        usageCount: 93,
      }
    ];

    res.json(sampleKnowledgeBases);
  } catch (error: any) {
    console.error("Error fetching knowledge bases:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get school by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

// Get school by registration code
router.get("/by-code/:code", async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({ message: "Registration code is required" });
    }

    try {
      // Try database first
      const school = await db.query.schools.findFirst({
        where: eq(schools.registrationCode, code.toUpperCase())
      });

      if (school) {
        return res.json(school);
      }
    } catch (dbError) {
      console.log('⚠️ Database failed, using file storage fallback:', dbError);
    }

    // Fallback to file storage
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const DATA_DIR = path.join(process.cwd(), 'data');
      const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');

      if (fs.existsSync(SCHOOLS_FILE)) {
        const fileContent = fs.readFileSync(SCHOOLS_FILE, 'utf8');
        const schools = JSON.parse(fileContent);
        const school = schools.find((s: any) => s.registrationCode === code.toUpperCase());
        
        if (school) {
          return res.json(school);
        }
      }
    } catch (fileError) {
      console.error('File storage also failed:', fileError);
    }

    return res.status(404).json({ message: "School not found with this registration code" });
  } catch (error: any) {
    console.error("Error fetching school by registration code:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


    const schoolId = parseInt(id);
    
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    let school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId)
    });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Ensure school has a registration code
    if (!school.registrationCode) {
      const registrationCode = generateRegistrationCode();
      try {
        // Try to update in database
        const [updatedSchool] = await db
          .update(schools)
          .set({ registrationCode })
          .where(eq(schools.id, schoolId))
          .returning();
        school = updatedSchool;
      } catch (dbError) {
        console.log('Database update failed, using file storage fallback');
        // Update in file storage
        const fs = await import('fs');
        const path = await import('path');
        
        const DATA_DIR = path.join(process.cwd(), 'data');
        const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');

        if (fs.existsSync(SCHOOLS_FILE)) {
          const fileContent = fs.readFileSync(SCHOOLS_FILE, 'utf8');
          const schoolsData = JSON.parse(fileContent);
          
          const schoolIndex = schoolsData.findIndex((s: any) => s.id === schoolId);
          if (schoolIndex !== -1) {
            schoolsData[schoolIndex].registrationCode = registrationCode;
            fs.writeFileSync(SCHOOLS_FILE, JSON.stringify(schoolsData, null, 2));
            school = { ...school, registrationCode };
          }
        }
      }
    }

    res.json(school);
  } catch (error: any) {
    console.error("Error fetching school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get staff for a school - placeholder until staff schema is properly defined
router.get("/:id/staff", async (req, res) => {
  try {
    res.json([]);
  } catch (error: any) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get students for a school
router.get("/:id/students", async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = parseInt(id);
    
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const students = await db.query.children.findMany({
      where: eq(children.schoolId, schoolId)
    });

    res.json(students);
  } catch (error: any) {
    console.error("Error fetching students:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;