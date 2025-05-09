import { Request, Response } from 'express';
import { storage } from '../storage';
import { ZodError } from 'zod';
import { insertKnowledgeBaseSchema } from '@shared/schema';
import { formatZodError } from '../utils';

// Get all public knowledge bases with optional limit
export const getPublicKnowledgeBases = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const knowledgeBases = await storage.getPublicKnowledgeBases(limit);
    return res.json(knowledgeBases);
  } catch (error) {
    console.error("Error getting public knowledge bases:", error);
    return res.status(500).json({ message: "Failed to retrieve public knowledge bases" });
  }
};

// Get knowledge bases by subject
export const getKnowledgeBasesBySubject = async (req: Request, res: Response) => {
  try {
    const { subject } = req.params;
    if (!subject) {
      return res.status(400).json({ message: "Subject is required" });
    }
    
    const knowledgeBases = await storage.getKnowledgeBasesBySubject(subject);
    return res.json(knowledgeBases);
  } catch (error) {
    console.error("Error getting knowledge bases by subject:", error);
    return res.status(500).json({ message: "Failed to retrieve knowledge bases" });
  }
};

// Get knowledge bases created by a user
export const getKnowledgeBasesByAuthor = async (req: Request, res: Response) => {
  try {
    const { authorId } = req.params;
    if (!authorId) {
      return res.status(400).json({ message: "Author ID is required" });
    }
    
    const knowledgeBases = await storage.getKnowledgeBasesByAuthor(parseInt(authorId));
    return res.json(knowledgeBases);
  } catch (error) {
    console.error("Error getting knowledge bases by author:", error);
    return res.status(500).json({ message: "Failed to retrieve knowledge bases" });
  }
};

// Get a specific knowledge base by ID
export const getKnowledgeBaseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Knowledge base ID is required" });
    }
    
    const knowledgeBase = await storage.getKnowledgeBase(parseInt(id));
    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }
    
    return res.json(knowledgeBase);
  } catch (error) {
    console.error("Error getting knowledge base:", error);
    return res.status(500).json({ message: "Failed to retrieve knowledge base" });
  }
};

// Create a new knowledge base
export const createKnowledgeBase = async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Validate request body against schema
    const data = insertKnowledgeBaseSchema.parse(req.body);
    
    // Create the knowledge base with the current user as author
    const knowledgeBase = await storage.createKnowledgeBase({
      ...data,
      authorId: userId
    });
    
    return res.status(201).json(knowledgeBase);
  } catch (error) {
    console.error("Error creating knowledge base:", error);
    
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: formatZodError(error) });
    }
    
    return res.status(500).json({ message: "Failed to create knowledge base" });
  }
};

// Update a knowledge base
export const updateKnowledgeBase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    if (!id) {
      return res.status(400).json({ message: "Knowledge base ID is required" });
    }
    
    // Check if knowledge base exists and is owned by the user
    const knowledgeBase = await storage.getKnowledgeBase(parseInt(id));
    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }
    
    if (knowledgeBase.authorId !== userId) {
      return res.status(403).json({ message: "You don't have permission to update this knowledge base" });
    }
    
    // Validate request body against schema
    const updateData = insertKnowledgeBaseSchema.partial().parse(req.body);
    
    // Update the knowledge base
    const updatedKnowledgeBase = await storage.updateKnowledgeBase(parseInt(id), updateData);
    
    return res.json(updatedKnowledgeBase);
  } catch (error) {
    console.error("Error updating knowledge base:", error);
    
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: formatZodError(error) });
    }
    
    return res.status(500).json({ message: "Failed to update knowledge base" });
  }
};

// Increment download count
export const incrementDownloadCount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Knowledge base ID is required" });
    }
    
    const updatedKnowledgeBase = await storage.incrementDownloadCount(parseInt(id));
    if (!updatedKnowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }
    
    return res.json({ success: true, downloadCount: updatedKnowledgeBase.downloadCount });
  } catch (error) {
    console.error("Error incrementing download count:", error);
    return res.status(500).json({ message: "Failed to update download count" });
  }
};

// Record a purchase
export const recordPurchase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    if (!id) {
      return res.status(400).json({ message: "Knowledge base ID is required" });
    }
    
    const knowledgeBase = await storage.getKnowledgeBase(parseInt(id));
    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }
    
    // Record the purchase
    const updatedKnowledgeBase = await storage.addPurchaser(parseInt(id), userId);
    
    return res.json({ success: true });
  } catch (error) {
    console.error("Error recording purchase:", error);
    return res.status(500).json({ message: "Failed to record purchase" });
  }
};