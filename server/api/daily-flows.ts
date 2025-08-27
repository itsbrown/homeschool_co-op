
import { Router, Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { dailyFlowTemplateSchema, dailyFlowEntrySchema, dailyFlowScheduleSchema } from "@shared/daily-flow-schema";
// Use proper authentication middleware
import { jwtCheck, requireRole } from "../middleware/auth0-auth";

// Extend Request to include auth from middleware
interface AuthenticatedRequest extends Request {
  auth?: any; // Simplified to avoid type conflicts with express-oauth2-jwt-bearer
}

const router = Router();

// Get daily flow templates for a school
router.get("/templates", jwtCheck, async (req, res) => {
  try {
    const { schoolId, gradeLevel, subject } = req.query;
    
    const templates = await storage.getDailyFlowTemplates({
      schoolId: schoolId ? parseInt(schoolId as string) : undefined,
      gradeLevel: gradeLevel as string,
      subject: subject as string
    });
    
    res.json(templates);
  } catch (error) {
    console.error("Error fetching daily flow templates:", error);
    res.status(500).json({ message: "Error fetching templates" });
  }
});

// Create daily flow template
router.post("/templates", jwtCheck, requireRole(["schoolAdmin", "superAdmin"]), async (req, res) => {
  try {
    const validatedData = dailyFlowTemplateSchema.parse(req.body);
    
    const template = await storage.createDailyFlowTemplate({
      ...validatedData,
      createdBy: (req as AuthenticatedRequest).auth?.email || 'unknown'
    });
    
    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Error creating daily flow template:", error);
    res.status(500).json({ message: "Error creating template" });
  }
});

// Get daily flow entries for a class and date range
router.get("/entries", jwtCheck, async (req, res) => {
  try {
    const { classId, startDate, endDate } = req.query;
    
    if (!classId) {
      return res.status(400).json({ message: "Class ID is required" });
    }
    
    const entries = await storage.getDailyFlowEntries({
      classId: parseInt(classId as string),
      startDate: startDate as string,
      endDate: endDate as string
    });
    
    res.json(entries);
  } catch (error) {
    console.error("Error fetching daily flow entries:", error);
    res.status(500).json({ message: "Error fetching entries" });
  }
});

// Create daily flow entry
router.post("/entries", jwtCheck, async (req, res) => {
  try {
    const validatedData = dailyFlowEntrySchema.parse(req.body);
    
    // Convert string dates to Date objects for storage
    const entryData = {
      ...validatedData,
      completedAt: validatedData.completedAt ? new Date(validatedData.completedAt) : null,
      createdBy: (req as AuthenticatedRequest).auth?.email || 'unknown'
    };
    
    const entry = await storage.createDailyFlowEntry(entryData);
    
    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Error creating daily flow entry:", error);
    res.status(500).json({ message: "Error creating entry" });
  }
});

// Update daily flow entry
router.patch("/entries/:id", jwtCheck, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const updateData = req.body;
    
    // Add lastModifiedBy field
    updateData.lastModifiedBy = (req as AuthenticatedRequest).auth?.email || 'unknown';
    updateData.updatedAt = new Date();
    
    const updatedEntry = await storage.updateDailyFlowEntry(entryId, updateData);
    
    if (!updatedEntry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    
    res.json(updatedEntry);
  } catch (error) {
    console.error("Error updating daily flow entry:", error);
    res.status(500).json({ message: "Error updating entry" });
  }
});

// Mark entry as completed
router.patch("/entries/:id/complete", jwtCheck, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const { notes } = req.body;
    
    const updateData = {
      isCompleted: true,
      completedBy: (req as AuthenticatedRequest).auth?.email || 'unknown',
      completedAt: new Date(),
      notes: notes || "",
      lastModifiedBy: (req as AuthenticatedRequest).auth?.email || 'unknown',
      updatedAt: new Date()
    };
    
    const updatedEntry = await storage.updateDailyFlowEntry(entryId, updateData);
    
    if (!updatedEntry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    
    res.json(updatedEntry);
  } catch (error) {
    console.error("Error marking entry as completed:", error);
    res.status(500).json({ message: "Error updating entry" });
  }
});

// Generate daily flow entries from template for a date range
router.post("/generate-from-template", jwtCheck, requireRole(["schoolAdmin", "superAdmin"]), async (req, res) => {
  try {
    const { templateId, classId, startDate, endDate } = req.body;
    
    if (!templateId || !classId || !startDate || !endDate) {
      return res.status(400).json({ message: "Template ID, class ID, start date, and end date are required" });
    }
    
    const generatedEntries = await storage.generateDailyFlowEntriesFromTemplate({
      templateId,
      classId,
      startDate,
      endDate,
      createdBy: (req as AuthenticatedRequest).auth?.email || 'unknown'
    });
    
    res.status(201).json(generatedEntries);
  } catch (error) {
    console.error("Error generating entries from template:", error);
    res.status(500).json({ message: "Error generating entries" });
  }
});

// Get completion statistics
router.get("/stats", jwtCheck, async (req, res) => {
  try {
    const { classId, startDate, endDate } = req.query;
    
    const stats = await storage.getDailyFlowStats({
      classId: classId ? parseInt(classId as string) : undefined,
      startDate: startDate as string,
      endDate: endDate as string
    });
    
    res.json(stats);
  } catch (error) {
    console.error("Error fetching daily flow stats:", error);
    res.status(500).json({ message: "Error fetching statistics" });
  }
});

export default router;
