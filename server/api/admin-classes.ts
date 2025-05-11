import { Router } from "express";
import { z } from "zod";
import { insertClassSchema } from "@shared/schema";
import { storage } from "../storage";
import { isAdmin, isAuthenticated } from "../middleware/auth";

const router = Router();

// Get all classes (with pagination and filters)
router.get("/classes", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const status = (req.query.status as string) || "";
    
    // Get classes from storage
    const classes = await storage.getClasses({
      page,
      limit,
      search,
      category,
      status: status as "published" | "draft" | ""
    });
    
    const totalCount = await storage.getClassesCount({
      search,
      category,
      status: status as "published" | "draft" | ""
    });
    
    const totalPages = Math.ceil(totalCount / limit);
    
    return res.status(200).json({
      classes,
      page,
      limit,
      totalCount,
      totalPages
    });
  } catch (error) {
    console.error("Error fetching classes:", error);
    return res.status(500).json({ message: "Error fetching classes" });
  }
});

// Get a specific class by ID
router.get("/classes/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    const classItem = await storage.getClassById(id);
    if (!classItem) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    return res.status(200).json(classItem);
  } catch (error) {
    console.error("Error fetching class:", error);
    return res.status(500).json({ message: "Error fetching class" });
  }
});

// Create a new class
router.post("/classes", isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Validate request body
    const validatedData = insertClassSchema.parse(req.body);
    
    // Create class
    const classItem = await storage.createClass({
      ...validatedData,
      instructorId: req.session.userId,
    });
    
    return res.status(201).json(classItem);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.format() 
      });
    }
    
    console.error("Error creating class:", error);
    return res.status(500).json({ message: "Error creating class" });
  }
});

// Update a class
router.patch("/classes/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    // Get existing class
    const existingClass = await storage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    // Check if user is authorized to update this class
    if (existingClass.instructorId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to update this class" });
    }
    
    // Partial validation of request body (allow partial updates)
    const validatedData = insertClassSchema.partial().parse(req.body);
    
    // Update class
    const updatedClass = await storage.updateClass(id, validatedData);
    
    return res.status(200).json(updatedClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.format() 
      });
    }
    
    console.error("Error updating class:", error);
    return res.status(500).json({ message: "Error updating class" });
  }
});

// Delete a class
router.delete("/classes/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    // Get existing class
    const existingClass = await storage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    // Check if user is authorized to delete this class
    if (existingClass.instructorId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to delete this class" });
    }
    
    // Delete class
    await storage.deleteClass(id);
    
    return res.status(200).json({ message: "Class deleted successfully" });
  } catch (error) {
    console.error("Error deleting class:", error);
    return res.status(500).json({ message: "Error deleting class" });
  }
});

export default router;