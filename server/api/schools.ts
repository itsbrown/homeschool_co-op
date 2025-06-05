import express from "express";
import { db } from "../db";
import { schools, children } from "@shared/schema";
import { insertSchoolSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = express.Router();

// Create a new school
router.post("/", async (req, res) => {
  try {
    // Validate the request body
    const validatedData = insertSchoolSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ 
        message: "Invalid school data", 
        errors: validatedData.error.issues 
      });
    }

    // Create the school
    const [newSchool] = await db
      .insert(schools)
      .values(validatedData.data)
      .returning();

    res.status(201).json(newSchool);
  } catch (error: any) {
    console.error("Error creating school:", error);
    res.status(500).json({ message: "Internal server error" });
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