import express from "express";
import { storage } from "../storage";
import { z } from "zod";
import { formatZodError } from "../utils";

const router = express.Router();

// Get all children for the authenticated parent user
router.get("/", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Get the user role
    const user = await storage.getUser(req.session.userId);
    
    if (!user || user.role !== "parent") {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Get all children for the parent
    const children = await storage.getChildrenByParentId(user.id);
    
    return res.json(children);
  } catch (error) {
    console.error("Error fetching children:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Get a specific child by ID
router.get("/:id", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const childId = parseInt(req.params.id);
    if (isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child ID" });
    }
    
    // Get the child
    const child = await storage.getChildById(childId);
    
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Get the user
    const user = await storage.getUser(req.session.userId);
    
    // Check if the user is an admin, the parent of the child, or an educator with permission
    if (!user || (user.role !== "admin" && child.parentId !== user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    return res.json(child);
  } catch (error) {
    console.error("Error fetching child:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Update a child
router.patch("/:id", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const childId = parseInt(req.params.id);
    if (isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child ID" });
    }
    
    // Get the child
    const child = await storage.getChildById(childId);
    
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Get the user
    const user = await storage.getUser(req.session.userId);
    
    // Check if the user is an admin or the parent of the child
    if (!user || (user.role !== "admin" && child.parentId !== user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    const updateSchema = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      age: z.number().min(1).optional(),
      gradeLevel: z.string().optional(),
      school: z.string().optional().nullable(),
      learningStyle: z.string().optional().nullable(),
      interests: z.array(z.string()).optional(),
      specialNeeds: z.string().optional().nullable(),
      allergies: z.string().optional().nullable(),
    });
    
    const parseResult = updateSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: formatZodError(parseResult.error),
      });
    }
    
    // Update the child
    const updatedChild = await storage.updateChild(childId, parseResult.data);
    
    return res.json(updatedChild);
  } catch (error) {
    console.error("Error updating child:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Delete a child
router.delete("/:id", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const childId = parseInt(req.params.id);
    if (isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child ID" });
    }
    
    // Get the child
    const child = await storage.getChildById(childId);
    
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Get the user
    const user = await storage.getUser(req.session.userId);
    
    // Check if the user is an admin or the parent of the child
    if (!user || (user.role !== "admin" && child.parentId !== user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Delete the child
    await storage.deleteChild(childId);
    
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting child:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Add authentication middleware
import { isAuthenticated } from "../middleware/auth";

router.use(isAuthenticated);

export default router;