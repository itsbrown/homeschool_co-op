import { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { knowledgeBases, knowledgeBaseRatings, userKnowledgeBases, marketplaceItems } from "@shared/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";

// Get all public knowledge bases
export async function getAllPublicKnowledgeBases(req: Request, res: Response) {
  try {
    const publicKnowledgeBases = await db.query.knowledgeBases.findMany({
      where: and(
        eq(knowledgeBases.isPublished, true),
        eq(knowledgeBases.isPublic, true)
      ),
      with: {
        author: {
          columns: {
            id: true,
            name: true
          }
        }
      }
    });

    return res.status(200).json(publicKnowledgeBases);
  } catch (error) {
    console.error("Error getting public knowledge bases:", error);
    return res.status(500).json({ message: "Failed to get public knowledge bases" });
  }
}

// Get a specific knowledge base by ID
export async function getKnowledgeBase(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge base ID" });
    }

    const knowledgeBase = await db.query.knowledgeBases.findFirst({
      where: eq(knowledgeBases.id, id),
      with: {
        author: {
          columns: {
            id: true,
            name: true
          }
        },
        ratings: true
      }
    });

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Check if user has access to this knowledge base (if not public)
    if (!knowledgeBase.isPublic && !knowledgeBase.isPublished) {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check if user is the author or has purchased/acquired the knowledge base
      if (knowledgeBase.authorId !== req.session.userId) {
        const userKnowledgeBase = await db.query.userKnowledgeBases.findFirst({
          where: and(
            eq(userKnowledgeBases.userId, req.session.userId),
            eq(userKnowledgeBases.knowledgeBaseId, id),
            eq(userKnowledgeBases.isActive, true)
          )
        });

        if (!userKnowledgeBase) {
          return res.status(403).json({ message: "You don't have access to this knowledge base" });
        }
      }
    }

    return res.status(200).json(knowledgeBase);
  } catch (error) {
    console.error("Error getting knowledge base:", error);
    return res.status(500).json({ message: "Failed to get knowledge base" });
  }
}

// Get knowledge bases for current user
export async function getUserKnowledgeBases(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get knowledge bases authored by the user
    const authoredKnowledgeBases = await db.query.knowledgeBases.findMany({
      where: eq(knowledgeBases.authorId, req.session.userId),
      with: {
        ratings: true
      }
    });

    // Get acquired/purchased knowledge bases
    const acquiredKnowledgeBases = await db.query.userKnowledgeBases.findMany({
      where: and(
        eq(userKnowledgeBases.userId, req.session.userId),
        eq(userKnowledgeBases.isActive, true)
      ),
      with: {
        knowledgeBase: {
          with: {
            author: {
              columns: {
                id: true,
                name: true
              }
            },
            ratings: true
          }
        }
      }
    });

    return res.status(200).json({
      authored: authoredKnowledgeBases,
      acquired: acquiredKnowledgeBases.map(item => item.knowledgeBase)
    });
  } catch (error) {
    console.error("Error getting user knowledge bases:", error);
    return res.status(500).json({ message: "Failed to get user knowledge bases" });
  }
}

// Create a new knowledge base
const createKnowledgeBaseSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  type: z.enum([
    "curriculum_standards", 
    "teaching_resources", 
    "assessment_tools", 
    "subject_specific", 
    "pedagogical_approaches", 
    "general"
  ]),
  subject: z.string().optional(),
  gradeLevel: z.string().optional(),
  content: z.any(), // will be validated more specifically in the handler
  isPublished: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  price: z.number().optional()
});

export async function createKnowledgeBase(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Validate request body
    const validatedData = createKnowledgeBaseSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ message: "Invalid knowledge base data", errors: validatedData.error.errors });
    }

    // Create the knowledge base
    const knowledgeBase = await db.insert(knowledgeBases).values({
      ...validatedData.data,
      authorId: req.session.userId,
    }).returning();

    return res.status(201).json(knowledgeBase[0]);
  } catch (error) {
    console.error("Error creating knowledge base:", error);
    return res.status(500).json({ message: "Failed to create knowledge base" });
  }
}

// Update a knowledge base
export async function updateKnowledgeBase(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge base ID" });
    }

    // Check if knowledge base exists and user owns it
    const existingKnowledgeBase = await db.query.knowledgeBases.findFirst({
      where: eq(knowledgeBases.id, id)
    });

    if (!existingKnowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    if (existingKnowledgeBase.authorId !== req.session.userId) {
      return res.status(403).json({ message: "You don't have permission to update this knowledge base" });
    }

    // Validate request body
    const validatedData = createKnowledgeBaseSchema.partial().safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ message: "Invalid knowledge base data", errors: validatedData.error.errors });
    }

    // Update the knowledge base
    const updatedKnowledgeBase = await db.update(knowledgeBases)
      .set({
        ...validatedData.data,
        updatedAt: new Date()
      })
      .where(eq(knowledgeBases.id, id))
      .returning();

    return res.status(200).json(updatedKnowledgeBase[0]);
  } catch (error) {
    console.error("Error updating knowledge base:", error);
    return res.status(500).json({ message: "Failed to update knowledge base" });
  }
}

// Delete a knowledge base
export async function deleteKnowledgeBase(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge base ID" });
    }

    // Check if knowledge base exists and user owns it
    const existingKnowledgeBase = await db.query.knowledgeBases.findFirst({
      where: eq(knowledgeBases.id, id)
    });

    if (!existingKnowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    if (existingKnowledgeBase.authorId !== req.session.userId) {
      return res.status(403).json({ message: "You don't have permission to delete this knowledge base" });
    }

    // Check if the knowledge base is published in the marketplace
    const marketplaceItem = await db.query.marketplaceItems.findFirst({
      where: and(
        eq(marketplaceItems.contentId, id),
        eq(marketplaceItems.itemType, "knowledge_base")
      )
    });

    if (marketplaceItem) {
      return res.status(409).json({ message: "Cannot delete a knowledge base that is published in the marketplace" });
    }

    // Delete the knowledge base
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id));

    return res.status(200).json({ message: "Knowledge base deleted successfully" });
  } catch (error) {
    console.error("Error deleting knowledge base:", error);
    return res.status(500).json({ message: "Failed to delete knowledge base" });
  }
}

// Add a knowledge base to the marketplace
const marketplaceSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0),
  isActive: z.boolean().optional()
});

export async function publishToMarketplace(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge base ID" });
    }

    // Validate request body
    const validatedData = marketplaceSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ message: "Invalid marketplace data", errors: validatedData.error.errors });
    }

    // Check if knowledge base exists and user owns it
    const knowledgeBase = await db.query.knowledgeBases.findFirst({
      where: eq(knowledgeBases.id, id)
    });

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    if (knowledgeBase.authorId !== req.session.userId) {
      return res.status(403).json({ message: "You don't have permission to publish this knowledge base" });
    }

    // Check if already in marketplace
    const existingItem = await db.query.marketplaceItems.findFirst({
      where: and(
        eq(marketplaceItems.contentId, id),
        eq(marketplaceItems.itemType, "knowledge_base")
      )
    });

    if (existingItem) {
      // Update the existing marketplace item
      const updatedItem = await db.update(marketplaceItems)
        .set({
          title: validatedData.data.title || knowledgeBase.title,
          description: validatedData.data.description || knowledgeBase.description,
          price: validatedData.data.price,
          isActive: validatedData.data.isActive !== undefined ? validatedData.data.isActive : true
        })
        .where(eq(marketplaceItems.id, existingItem.id))
        .returning();

      return res.status(200).json(updatedItem[0]);
    } else {
      // Create a new marketplace item
      const newItem = await db.insert(marketplaceItems)
        .values({
          title: validatedData.data.title || knowledgeBase.title,
          description: validatedData.data.description || knowledgeBase.description,
          price: validatedData.data.price,
          sellerId: req.session.userId,
          itemType: "knowledge_base",
          contentId: id,
          isActive: validatedData.data.isActive !== undefined ? validatedData.data.isActive : true
        })
        .returning();

      // Update the knowledge base to be published
      await db.update(knowledgeBases)
        .set({
          isPublished: true,
          price: validatedData.data.price
        })
        .where(eq(knowledgeBases.id, id));

      return res.status(201).json(newItem[0]);
    }
  } catch (error) {
    console.error("Error publishing knowledge base to marketplace:", error);
    return res.status(500).json({ message: "Failed to publish knowledge base to marketplace" });
  }
}

// Rate a knowledge base
const ratingSchema = z.object({
  rating: z.number().min(1).max(5).int(),
  comment: z.string().optional()
});

export async function rateKnowledgeBase(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge base ID" });
    }

    // Validate request body
    const validatedData = ratingSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ message: "Invalid rating data", errors: validatedData.error.errors });
    }

    // Check if knowledge base exists
    const knowledgeBase = await db.query.knowledgeBases.findFirst({
      where: eq(knowledgeBases.id, id)
    });

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Check if user has already rated this knowledge base
    const existingRating = await db.query.knowledgeBaseRatings.findFirst({
      where: and(
        eq(knowledgeBaseRatings.knowledgeBaseId, id),
        eq(knowledgeBaseRatings.userId, req.session.userId)
      )
    });

    let rating;
    if (existingRating) {
      // Update existing rating
      rating = await db.update(knowledgeBaseRatings)
        .set({
          rating: validatedData.data.rating,
          comment: validatedData.data.comment
        })
        .where(eq(knowledgeBaseRatings.id, existingRating.id))
        .returning();
    } else {
      // Create new rating
      rating = await db.insert(knowledgeBaseRatings)
        .values({
          knowledgeBaseId: id,
          userId: req.session.userId,
          rating: validatedData.data.rating,
          comment: validatedData.data.comment
        })
        .returning();
    }

    // Update the knowledge base average rating
    const result = await db.select({
      avgRating: sql`AVG(${knowledgeBaseRatings.rating})`,
      count: sql`COUNT(*)`
    })
    .from(knowledgeBaseRatings)
    .where(eq(knowledgeBaseRatings.knowledgeBaseId, id));

    if (result.length > 0) {
      await db.update(knowledgeBases)
        .set({
          avgRating: result[0].avgRating,
          ratingCount: result[0].count
        })
        .where(eq(knowledgeBases.id, id));
    }

    return res.status(200).json(rating[0]);
  } catch (error) {
    console.error("Error rating knowledge base:", error);
    return res.status(500).json({ message: "Failed to rate knowledge base" });
  }
}

// Download (acquire) a knowledge base
export async function acquireKnowledgeBase(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge base ID" });
    }

    // Check if knowledge base exists
    const knowledgeBase = await db.query.knowledgeBases.findFirst({
      where: eq(knowledgeBases.id, id)
    });

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    // Check if user already has this knowledge base
    const existingAcquisition = await db.query.userKnowledgeBases.findFirst({
      where: and(
        eq(userKnowledgeBases.knowledgeBaseId, id),
        eq(userKnowledgeBases.userId, req.session.userId)
      )
    });

    if (existingAcquisition) {
      // If inactive, reactivate it
      if (!existingAcquisition.isActive) {
        await db.update(userKnowledgeBases)
          .set({ isActive: true })
          .where(eq(userKnowledgeBases.id, existingAcquisition.id));
      }
      return res.status(200).json({ message: "Knowledge base already acquired" });
    }

    // Record the acquisition
    await db.insert(userKnowledgeBases)
      .values({
        knowledgeBaseId: id,
        userId: req.session.userId,
        isPurchased: false, // This is a free acquisition, not a purchase
        isActive: true
      });

    // Increment the download count
    await db.update(knowledgeBases)
      .set({ downloads: knowledgeBase.downloads + 1 })
      .where(eq(knowledgeBases.id, id));

    return res.status(200).json({ message: "Knowledge base acquired successfully" });
  } catch (error) {
    console.error("Error acquiring knowledge base:", error);
    return res.status(500).json({ message: "Failed to acquire knowledge base" });
  }
}

// Get recommended knowledge bases for content generation
export async function getRecommendedKnowledgeBases(req: Request, res: Response) {
  try {
    const { subject, gradeLevel } = req.query;
    
    let query = db.select().from(knowledgeBases).where(
      and(
        eq(knowledgeBases.isPublished, true),
        eq(knowledgeBases.isPublic, true)
      )
    );
    
    if (subject) {
      query = query.where(eq(knowledgeBases.subject, subject as string));
    }
    
    if (gradeLevel) {
      query = query.where(eq(knowledgeBases.gradeLevel, gradeLevel as string));
    }
    
    // Add rating filter to get better rated knowledge bases first
    query = query.orderBy(knowledgeBases.avgRating, knowledgeBases.downloads);
    
    const recommendedKnowledgeBases = await query.limit(5);
    
    return res.status(200).json(recommendedKnowledgeBases);
  } catch (error) {
    console.error("Error getting recommended knowledge bases:", error);
    return res.status(500).json({ message: "Failed to get recommended knowledge bases" });
  }
}