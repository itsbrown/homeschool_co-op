import { Request, Response } from "express";
import { storage } from "../storage";
import { insertChildSchema } from "@shared/schema";
import { ZodError } from "zod";
import { formatZodError } from "../utils";

// Get all children for the authenticated parent user
export const getMyChildren = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const children = await storage.getChildrenByParentId(req.session.userId);
    res.json(children);
  } catch (error: any) {
    console.error("Error fetching children:", error);
    res.status(500).json({ message: "Error fetching children", error: error.message });
  }
};

// Get a specific child by ID (only if parent owns the child)
export const getChildById = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const childId = parseInt(req.params.id);
    if (isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child ID" });
    }

    const child = await storage.getChildById(childId);
    
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Security check - only allow parent to access their own children
    if (child.parentId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to access this child" });
    }

    res.json(child);
  } catch (error: any) {
    console.error("Error fetching child:", error);
    res.status(500).json({ message: "Error fetching child", error: error.message });
  }
};

// Create a new child for the authenticated parent
export const createChild = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const validatedData = insertChildSchema.parse(req.body);
    
    const child = await storage.createChild({
      ...validatedData,
      parentId: req.session.userId
    });

    res.status(201).json(child);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid child data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error creating child:", error);
    res.status(500).json({ message: "Error creating child", error: error.message });
  }
};

// Update an existing child (only if parent owns the child)
export const updateChild = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const childId = parseInt(req.params.id);
    if (isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child ID" });
    }

    // First check if child exists and belongs to parent
    const existingChild = await storage.getChildById(childId);
    if (!existingChild) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Security check - only allow parent to update their own children
    if (existingChild.parentId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to update this child" });
    }

    const validatedData = insertChildSchema.partial().parse(req.body);
    
    const updatedChild = await storage.updateChild(childId, validatedData);
    res.json(updatedChild);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid child data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error updating child:", error);
    res.status(500).json({ message: "Error updating child", error: error.message });
  }
};

// Delete a child (only if parent owns the child)
export const deleteChild = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const childId = parseInt(req.params.id);
    if (isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child ID" });
    }

    // First check if child exists and belongs to parent
    const existingChild = await storage.getChildById(childId);
    if (!existingChild) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    // Security check - only allow parent to delete their own children
    if (existingChild.parentId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to delete this child" });
    }

    await storage.deleteChild(childId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting child:", error);
    res.status(500).json({ message: "Error deleting child", error: error.message });
  }
};