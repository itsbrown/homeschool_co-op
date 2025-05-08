import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertMarketplaceItemSchema } from "@shared/schema";
import { isAuthenticated, hasRole } from "./auth";

const router = Router();

// Create a marketplace item
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const validatedData = insertMarketplaceItemSchema.parse(req.body);
    
    // Verify content exists and user has permission
    if (validatedData.itemType === "curriculum") {
      const curriculum = await storage.getCurriculum(validatedData.contentId);
      
      if (!curriculum) {
        return res.status(404).json({ message: "Curriculum not found" });
      }
      
      if (curriculum.authorId !== req.session.userId) {
        return res.status(403).json({ message: "You don't have permission to list this curriculum" });
      }
      
      // Update curriculum with price
      await storage.updateCurriculum(curriculum.id, { price: validatedData.price });
    } else if (validatedData.itemType === "lesson") {
      const lesson = await storage.getLesson(validatedData.contentId);
      
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }
      
      if (lesson.authorId !== req.session.userId) {
        return res.status(403).json({ message: "You don't have permission to list this lesson" });
      }
    }
    
    const marketplaceItem = await storage.createMarketplaceItem({
      ...validatedData,
      sellerId: req.session.userId
    });
    
    res.status(201).json(marketplaceItem);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Create marketplace item error:", error);
    res.status(500).json({ message: "Error creating marketplace item" });
  }
});

// Get all marketplace items
router.get("/", isAuthenticated, async (req, res) => {
  try {
    // In a real app, we would use pagination and filters
    const items = await storage.getMarketplaceItemsBySeller(req.session.userId);
    res.status(200).json(items);
  } catch (error) {
    console.error("Get marketplace items error:", error);
    res.status(500).json({ message: "Error fetching marketplace items" });
  }
});

// Get top selling items
router.get("/top", isAuthenticated, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const items = await storage.getTopSellingItems(limit);
    res.status(200).json(items);
  } catch (error) {
    console.error("Get top selling items error:", error);
    res.status(500).json({ message: "Error fetching top selling items" });
  }
});

// Get items by seller
router.get("/seller", isAuthenticated, async (req, res) => {
  try {
    const items = await storage.getMarketplaceItemsBySeller(req.session.userId);
    res.status(200).json(items);
  } catch (error) {
    console.error("Get seller items error:", error);
    res.status(500).json({ message: "Error fetching seller's items" });
  }
});

// Get a specific marketplace item
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = await storage.getMarketplaceItem(itemId);
    
    if (!item) {
      return res.status(404).json({ message: "Marketplace item not found" });
    }
    
    res.status(200).json(item);
  } catch (error) {
    console.error("Get marketplace item error:", error);
    res.status(500).json({ message: "Error fetching marketplace item" });
  }
});

// Update marketplace item status (active/inactive)
router.patch("/:id/status", isAuthenticated, async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { isActive } = req.body;
    
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }
    
    const item = await storage.getMarketplaceItem(itemId);
    
    if (!item) {
      return res.status(404).json({ message: "Marketplace item not found" });
    }
    
    if (item.sellerId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // In a real app, we would have a updateMarketplaceItem method
    // For now, use the updateMarketplaceItemStats method
    const updatedItem = await storage.updateMarketplaceItemStats(itemId, 0, 0);
    
    res.status(200).json(updatedItem);
  } catch (error) {
    console.error("Update marketplace item status error:", error);
    res.status(500).json({ message: "Error updating marketplace item status" });
  }
});

// Simulate a purchase (for demo purposes)
router.post("/:id/purchase", isAuthenticated, async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = await storage.getMarketplaceItem(itemId);
    
    if (!item) {
      return res.status(404).json({ message: "Marketplace item not found" });
    }
    
    // In a real app, we would handle payment processing
    // For demo, just update sales count and revenue
    const updatedItem = await storage.updateMarketplaceItemStats(itemId, 1, item.price);
    
    res.status(200).json({
      message: "Purchase successful",
      item: updatedItem
    });
  } catch (error) {
    console.error("Purchase error:", error);
    res.status(500).json({ message: "Error processing purchase" });
  }
});

export default router;
