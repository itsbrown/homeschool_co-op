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