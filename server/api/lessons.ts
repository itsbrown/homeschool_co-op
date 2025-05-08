import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertLessonSchema } from "@shared/schema";
import { isAuthenticated, hasRole } from "./auth";

const router = Router();

// Create a new lesson
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const validatedData = insertLessonSchema.parse(req.body);
    
    // If associated with a curriculum, verify access
    if (validatedData.curriculumId) {
      const curriculum = await storage.getCurriculum(validatedData.curriculumId);
      
      if (!curriculum) {
        return res.status(404).json({ message: "Associated curriculum not found" });
      }
      
      // Check if user is the curriculum author
      if (curriculum.authorId !== req.session.userId) {
        return res.status(403).json({ message: "You don't have permission to add lessons to this curriculum" });
      }
    }
    
    const lesson = await storage.createLesson({
      ...validatedData,
      authorId: req.session.userId
    });
    
    res.status(201).json(lesson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Create lesson error:", error);
    res.status(500).json({ message: "Error creating lesson" });
  }
});

// Get all lessons for authenticated user
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const lessons = await storage.getLessonsByAuthor(req.session.userId);
    res.status(200).json(lessons);
  } catch (error) {
    console.error("Get lessons error:", error);
    res.status(500).json({ message: "Error fetching lessons" });
  }
});

// Get lessons by curriculum ID
router.get("/curriculum/:curriculumId", isAuthenticated, async (req, res) => {
  try {
    const curriculumId = parseInt(req.params.curriculumId);
    
    // Verify access to curriculum
    const curriculum = await storage.getCurriculum(curriculumId);
    
    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }
    
    // Check if user is author or curriculum is public
    if (curriculum.authorId !== req.session.userId && !curriculum.isPublic) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    const lessons = await storage.getLessonsByCurriculum(curriculumId);
    res.status(200).json(lessons);
  } catch (error) {
    console.error("Get curriculum lessons error:", error);
    res.status(500).json({ message: "Error fetching lessons" });
  }
});

// Get a specific lesson
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const lesson = await storage.getLesson(lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    
    // Check if user is author or has access to associated curriculum
    if (lesson.authorId !== req.session.userId) {
      // If lesson is part of a curriculum, check curriculum access
      if (lesson.curriculumId) {
        const curriculum = await storage.getCurriculum(lesson.curriculumId);
        if (!curriculum || (!curriculum.isPublic && curriculum.authorId !== req.session.userId)) {
          return res.status(403).json({ message: "Forbidden" });
        }
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    
    res.status(200).json(lesson);
  } catch (error) {
    console.error("Get lesson error:", error);
    res.status(500).json({ message: "Error fetching lesson" });
  }
});

// Update a lesson
router.patch("/:id", isAuthenticated, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const lesson = await storage.getLesson(lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    
    // Check if user is the author
    if (lesson.authorId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Update lesson
    const updatedLesson = await storage.updateLesson(lessonId, req.body);
    
    res.status(200).json(updatedLesson);
  } catch (error) {
    console.error("Update lesson error:", error);
    res.status(500).json({ message: "Error updating lesson" });
  }
});

// Change lesson status
router.patch("/:id/status", isAuthenticated, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const { status } = req.body;
    
    // Validate status
    if (!status || !["draft", "published", "archived"].includes(status)) {
      return res.status(400).json({ 
        message: "Invalid status. Must be one of: draft, published, archived" 
      });
    }
    
    const lesson = await storage.getLesson(lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    
    // Check if user is the author
    if (lesson.authorId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Update lesson status
    const updatedLesson = await storage.updateLesson(lessonId, { status });
    
    res.status(200).json(updatedLesson);
  } catch (error) {
    console.error("Update lesson status error:", error);
    res.status(500).json({ message: "Error updating lesson status" });
  }
});

// Duplicate a lesson
router.post("/:id/duplicate", isAuthenticated, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const lesson = await storage.getLesson(lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    
    // Check if user is the author
    if (lesson.authorId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Create duplicate lesson
    const duplicateLesson = await storage.createLesson({
      ...lesson,
      id: undefined,
      title: `${lesson.title} (Copy)`,
      status: "draft",
      isPublished: false,
      createdAt: undefined,
      updatedAt: undefined
    });
    
    res.status(201).json(duplicateLesson);
  } catch (error) {
    console.error("Duplicate lesson error:", error);
    res.status(500).json({ message: "Error duplicating lesson" });
  }
});

export default router;
