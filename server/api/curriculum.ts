import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertCurriculumSchema } from "@shared/schema";
import { isAuthenticated, hasRole } from "./auth";
import { 
  generateCurriculumTemplate, 
  curriculumTemplateToDbFormat,
  lessonTemplateToDbFormat
} from "../services/curriculumService";

const router = Router();

// Create a new curriculum
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const validatedData = insertCurriculumSchema.parse(req.body);
    
    const curriculum = await storage.createCurriculum({
      ...validatedData,
      authorId: req.session.userId
    });
    
    res.status(201).json(curriculum);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Create curriculum error:", error);
    res.status(500).json({ message: "Error creating curriculum" });
  }
});

// Get all curricula for authenticated user
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const curricula = await storage.getCurriculaByAuthor(req.session.userId);
    res.status(200).json(curricula);
  } catch (error) {
    console.error("Get curricula error:", error);
    res.status(500).json({ message: "Error fetching curricula" });
  }
});

// Get a specific curriculum
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const curriculumId = parseInt(req.params.id);
    const curriculum = await storage.getCurriculum(curriculumId);
    
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    
    // Check if user is author or curriculum is public
    if (curriculum.authorId !== req.session.userId && !curriculum.isPublic) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    res.status(200).json(curriculum);
  } catch (error) {
    console.error("Get curriculum error:", error);
    res.status(500).json({ message: "Error fetching curriculum" });
  }
});

// Update a curriculum
router.patch("/:id", isAuthenticated, async (req, res) => {
  try {
    const curriculumId = parseInt(req.params.id);
    const curriculum = await storage.getCurriculum(curriculumId);
    
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    
    // Check if user is the author
    if (curriculum.authorId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Validate update data (partial)
    const updateData = req.body;
    
    // Update curriculum
    const updatedCurriculum = await storage.updateCurriculum(curriculumId, updateData);
    
    res.status(200).json(updatedCurriculum);
  } catch (error) {
    console.error("Update curriculum error:", error);
    res.status(500).json({ message: "Error updating curriculum" });
  }
});

// Publish a curriculum
router.post("/:id/publish", isAuthenticated, async (req, res) => {
  try {
    const curriculumId = parseInt(req.params.id);
    const curriculum = await storage.getCurriculum(curriculumId);
    
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    
    // Check if user is the author
    if (curriculum.authorId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Update curriculum to published state
    const updatedCurriculum = await storage.updateCurriculum(curriculumId, {
      isPublished: true
    });
    
    res.status(200).json(updatedCurriculum);
  } catch (error) {
    console.error("Publish curriculum error:", error);
    res.status(500).json({ message: "Error publishing curriculum" });
  }
});

// AI curriculum generation
router.post("/generate", isAuthenticated, async (req, res) => {
  try {
    const formData = req.body;
    
    // Validate form data
    if (!formData.subject || !formData.gradeLevel || !formData.learningStyles || formData.learningStyles.length === 0) {
      return res.status(400).json({
        message: "Required fields are missing",
        requiredFields: ["subject", "gradeLevel", "learningStyles"]
      });
    }
    
    // Generate curriculum template
    const curriculumTemplate = await generateCurriculumTemplate(formData);
    
    // Convert to database format
    const curriculumData = curriculumTemplateToDbFormat(curriculumTemplate, req.session.userId);
    
    // Save to database
    const curriculum = await storage.createCurriculum(curriculumData);
    
    // Create associated lessons
    for (const unit of curriculumTemplate.units) {
      for (const lessonTemplate of unit.lessons) {
        const lessonData = lessonTemplateToDbFormat(
          lessonTemplate,
          unit.title,
          curriculum.id,
          req.session.userId,
          curriculumData.subject,
          curriculumData.gradeLevel
        );
        
        await storage.createLesson(lessonData);
      }
    }
    
    res.status(201).json(curriculum);
  } catch (error) {
    console.error("Generate curriculum error:", error);
    res.status(500).json({ message: "Error generating curriculum" });
  }
});

export default router;
