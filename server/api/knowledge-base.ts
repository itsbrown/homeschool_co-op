import { Request, Response } from "express";
import { storage } from "../storage";
import { insertKnowledgeBaseSchema } from "@shared/schema";
import { z } from "zod";
import { formatZodError } from "../utils";

/**
 * Get a list of public knowledge bases
 */
export const getPublicKnowledgeBases = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const knowledgeBases = await storage.getPublicKnowledgeBases(limit);
    res.status(200).json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching public knowledge bases:", error);
    res.status(500).json({ message: "Error fetching public knowledge bases" });
  }
};

/**
 * Get knowledge bases by subject
 */
export const getKnowledgeBasesBySubject = async (req: Request, res: Response) => {
  try {
    const { subject } = req.params;
    const knowledgeBases = await storage.getKnowledgeBasesBySubject(subject);
    res.status(200).json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching knowledge bases by subject:", error);
    res.status(500).json({ message: "Error fetching knowledge bases" });
  }
};

/**
 * Get knowledge bases by author
 */
export const getKnowledgeBasesByAuthor = async (req: Request, res: Response) => {
  try {
    const { authorId } = req.params;

    // If requesting own knowledge bases, use session user ID
    const targetAuthorId = authorId === "me" ? req.session.userId : parseInt(authorId);

    try {
      const knowledgeBases = await storage.getKnowledgeBasesByAuthor(targetAuthorId);
      res.status(200).json(knowledgeBases);
    } catch (dbError) {
      // Fallback to file storage when database is unavailable
      console.log('🔄 Database unavailable for knowledge bases by author, falling back to file storage...');
      try {
        const fs = await import('fs');
        const path = await import('path');

        const kbFilePath = path.join(process.cwd(), 'data', 'knowledge-bases.json');
        let knowledgeBases = [];

        if (fs.existsSync(kbFilePath)) {
          const fileContent = fs.readFileSync(kbFilePath, 'utf-8');
          knowledgeBases = JSON.parse(fileContent);
        }

        // Filter by author
        const authorKnowledgeBases = knowledgeBases.filter(kb => kb.authorId === targetAuthorId);
        res.status(200).json(authorKnowledgeBases);
      } catch (fileError) {
        console.error('File storage fallback failed:', fileError);
        throw dbError; // Re-throw original database error
      }
    }
  } catch (error) {
    console.error("Error fetching knowledge bases by author:", error);
    res.status(500).json({ message: "Error fetching knowledge bases" });
  }
};

/**
 * Get a specific knowledge base by ID
 */
export const getKnowledgeBaseById = async (req: Request, res: Response) => {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Check if knowledge base is public or user is authenticated and is the author
    const isAuthor = req.session.userId && knowledgeBase.authorId === req.session.userId;
    if (!knowledgeBase.isPublic && !isAuthor) {
      return res.status(403).json({ message: "You don't have permission to access this knowledge base" });
    }

    res.status(200).json(knowledgeBase);
  } catch (error) {
    console.error("Error fetching knowledge base:", error);
    res.status(500).json({ message: "Error fetching knowledge base" });
  }
};

/**
 * Create a new knowledge base
 */
export const createKnowledgeBase = async (req: Request, res: Response) => {
  try {
    const validatedData = insertKnowledgeBaseSchema.parse(req.body);

    try {
      const knowledgeBase = await storage.createKnowledgeBase({
        ...validatedData,
        authorId: req.session.userId
      });

      res.status(201).json(knowledgeBase);
    } catch (dbError) {
      // Fallback to file storage when database is unavailable
      console.log('🔄 Database unavailable for knowledge base creation, falling back to file storage...');
      try {
        const fs = await import('fs');
        const path = await import('path');

        // Ensure data directory exists
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        // Load existing knowledge bases from file
        const kbFilePath = path.join(dataDir, 'knowledge-bases.json');
        let knowledgeBases = [];

        if (fs.existsSync(kbFilePath)) {
          try {
            const fileContent = fs.readFileSync(kbFilePath, 'utf-8');
            knowledgeBases = JSON.parse(fileContent);
          } catch (parseError) {
            console.warn('Failed to parse existing knowledge bases file, starting fresh:', parseError);
            knowledgeBases = [];
          }
        }

        // Create new knowledge base with file storage
        const newId = Math.max(0, ...knowledgeBases.map(kb => kb.id || 0)) + 1;
        const knowledgeBase = {
          id: newId,
          ...validatedData,
          authorId: req.session.userId,
          downloadCount: 0,
          purchasedBy: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        knowledgeBases.push(knowledgeBase);

        // Save to file with error handling
        try {
          fs.writeFileSync(kbFilePath, JSON.stringify(knowledgeBases, null, 2));
          console.log(`✅ Knowledge base created in file storage with ID ${newId}`);
          res.status(201).json(knowledgeBase);
        } catch (writeError) {
          console.error('Failed to write knowledge base to file:', writeError);
          throw new Error('Failed to save knowledge base to file storage');
        }
      } catch (fileError) {
        console.error('File storage fallback failed:', fileError);
        res.status(500).json({ 
          message: "Failed to create knowledge base", 
          error: "Both database and file storage are unavailable" 
        });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: formatZodError(error)
      });
    }
    console.error("Error creating knowledge base:", error);
    res.status(500).json({ message: "Error creating knowledge base" });
  }
};

/**
 * Update an existing knowledge base
 */
export const updateKnowledgeBase = async (req: Request, res: Response) => {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Check if user is the author
    if (knowledgeBase.authorId !== req.session.userId) {
      return res.status(403).json({ message: "You don't have permission to update this knowledge base" });
    }

    const validatedData = insertKnowledgeBaseSchema.partial().parse(req.body);
    const updatedKnowledgeBase = await storage.updateKnowledgeBase(knowledgeBaseId, validatedData);

    res.status(200).json(updatedKnowledgeBase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: formatZodError(error)
      });
    }
    console.error("Error updating knowledge base:", error);
    res.status(500).json({ message: "Error updating knowledge base" });
  }
};

/**
 * Increment the download count for a knowledge base
 */
export const incrementDownloadCount = async (req: Request, res: Response) => {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Increment the download count
    const updatedKnowledgeBase = await storage.incrementDownloadCount(knowledgeBaseId);

    res.status(200).json({ 
      success: true, 
      downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
    });
  } catch (error) {
    console.error("Error recording download:", error);
    res.status(500).json({ message: "Error recording download" });
  }
};

/**
 * Record a purchase of a knowledge base
 */
export const recordPurchase = async (req: Request, res: Response) => {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Record the purchase
    await storage.addPurchaser(knowledgeBaseId, req.session.userId);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error recording purchase:", error);
    res.status(500).json({ message: "Error recording purchase" });
  }
};

/**
 * Get combined knowledge bases (public + user's own)
 * This endpoint provides both public knowledge bases and the
 * authenticated user's own knowledge bases in a single list
 */
export const getCombinedKnowledgeBases = async (req: Request, res: Response) => {
  try {
    let publicKnowledgeBases = [];
    let userKnowledgeBases = [];

    try {
      // Get public knowledge bases
      publicKnowledgeBases = await storage.getPublicKnowledgeBases();
    } catch (error) {
      console.error("Error fetching public knowledge bases:", error);
      // Fallback to file storage for public knowledge bases
      try {
        const fs = await import('fs');
        const path = await import('path');

        const kbFilePath = path.join(process.cwd(), 'data', 'knowledge-bases.json');
        if (fs.existsSync(kbFilePath)) {
          const fileContent = fs.readFileSync(kbFilePath, 'utf-8');
          const allKnowledgeBases = JSON.parse(fileContent);
          publicKnowledgeBases = allKnowledgeBases.filter(kb => kb.isPublic);
        }
      } catch (fileError) {
        console.error("File storage fallback failed for public knowledge bases:", fileError);
      }
    }

    // Get user's own knowledge bases if authenticated
    if (req.session?.userId) {
      try {
        userKnowledgeBases = await storage.getKnowledgeBasesByAuthor(req.session.userId);
      } catch (error) {
        console.error("Error fetching user knowledge bases:", error);
        // Fallback to file storage for user knowledge bases
        try {
          const fs = await import('fs');
          const path = await import('path');

          const kbFilePath = path.join(process.cwd(), 'data', 'knowledge-bases.json');
          if (fs.existsSync(kbFilePath)) {
            const fileContent = fs.readFileSync(kbFilePath, 'utf-8');
            const allKnowledgeBases = JSON.parse(fileContent);
            userKnowledgeBases = allKnowledgeBases.filter(kb => kb.authorId === req.session.userId);
          }
        } catch (fileError) {
          console.error("File storage fallback failed for user knowledge bases:", fileError);
        }
      }
    }

    // Combine both sets, removing duplicates
    const combinedKnowledgeBases = [...publicKnowledgeBases];

    // Add user's own knowledge bases that aren't already in the array
    for (const kb of userKnowledgeBases) {
      if (!publicKnowledgeBases.some(p => p.id === kb.id)) {
        combinedKnowledgeBases.push(kb);
      }
    }

    res.status(200).json(combinedKnowledgeBases);
  } catch (error) {
    console.error("Error fetching combined knowledge bases:", error);
    res.status(500).json({ message: "Error fetching knowledge bases" });
  }
};