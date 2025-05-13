import express from "express";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { storage } from "../storage";
import { checkOpenAIStatus, generateEducationalActivity } from "../services/openai";
import { InsertActivity } from "../../shared/schema";

const router = express.Router();

// Schema for activity generation request
const ActivityGenerationSchema = z.object({
  subject: z.string(),
  ageRange: z.string(),
  activityType: z.string(),
  difficulty: z.string(),
  instructions: z.string(),
  knowledgeBaseIds: z.array(z.number()).optional().default([]),
});

type ActivityGenerationRequest = z.infer<typeof ActivityGenerationSchema>;

// Fetch content from selected knowledge bases
async function getKnowledgeBaseContent(knowledgeBaseIds: number[], userId: number) {
  if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) {
    return "";
  }

  try {
    const contentChunks = await Promise.all(
      knowledgeBaseIds.map(async (id) => {
        const kb = await storage.getKnowledgeBaseById(id, userId);
        if (kb) {
          return `KNOWLEDGE BASE: ${kb.title}\nSUBJECT: ${kb.subject}\n\nCONTENT:\n${JSON.stringify(kb.content)}\n\n`;
        }
        return "";
      })
    );

    return contentChunks.join("\n");
  } catch (error) {
    console.error("Error fetching knowledge base content:", error);
    return "";
  }
}

// Generate activity using AI
async function generateActivity(params: ActivityGenerationRequest, userId: number) {
  try {
    // Check OpenAI status
    const openaiStatus = await checkOpenAIStatus();
    if (!openaiStatus.available) {
      return { 
        success: false, 
        error: "OpenAI service is not available. Please check your API key." 
      };
    }

    // Get content from knowledge bases
    const knowledgeBaseContent = await getKnowledgeBaseContent(params.knowledgeBaseIds || [], userId);
    
    // Generate activity using OpenAI
    const generatedActivity = await generateEducationalActivity(
      params.subject,
      params.ageRange,
      params.activityType,
      params.difficulty,
      params.instructions,
      knowledgeBaseContent
    );

    // Create a folder for storing generated activities if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads");
    const activitiesDir = path.join(uploadsDir, "activities");
    
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(activitiesDir, { recursive: true });
    } catch (error) {
      console.error("Error creating directories:", error);
    }

    // Store the generated activity data in a JSON file
    const timestamp = new Date().getTime();
    const filename = `${params.activityType}_${params.subject.replace(/\s+/g, '_')}_${timestamp}.json`;
    const filePath = path.join(activitiesDir, filename);
    
    await fs.writeFile(filePath, JSON.stringify(generatedActivity, null, 2));

    // Save activity in database
    const activityData: InsertActivity = {
      title: generatedActivity.title,
      description: generatedActivity.description || "",
      activityType: params.activityType,
      subject: params.subject,
      difficulty: params.difficulty,
      ageRange: params.ageRange,
      content: generatedActivity,
      filePath: `/uploads/activities/${filename}`,
      authorId: userId,
      isPublic: false, // Default to private
    };

    const savedActivity = await storage.createActivity(activityData);

    return {
      success: true,
      activity: savedActivity,
      activityContent: generatedActivity,
      filePath: `/uploads/activities/${filename}`
    };
  } catch (error) {
    console.error("Error generating activity:", error);
    return {
      success: false,
      error: `Failed to generate activity: ${error.message}`
    };
  }
}

// Get all activities by author
router.get("/by-author/:authorId", async (req, res) => {
  try {
    const authorId = parseInt(req.params.authorId);
    if (isNaN(authorId)) {
      return res.status(400).json({ message: "Invalid author ID" });
    }

    const activities = await storage.getActivitiesByAuthor(authorId);
    return res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return res.status(500).json({ message: "Failed to fetch activities" });
  }
});

// Get activity by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const activity = await storage.getActivityById(id, userId);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    return res.json(activity);
  } catch (error) {
    console.error("Error fetching activity:", error);
    return res.status(500).json({ message: "Failed to fetch activity" });
  }
});

// Generate activity
router.post("/generate", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const validationResult = ActivityGenerationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid activity generation parameters", 
        errors: validationResult.error.errors 
      });
    }

    const result = await generateActivity(validationResult.data, userId);
    if (!result.success) {
      return res.status(500).json({ message: result.error });
    }

    return res.json(result);
  } catch (error) {
    console.error("Error generating activity:", error);
    return res.status(500).json({ message: "Failed to generate activity" });
  }
});

// Update activity download count
router.post("/:id/download", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const activity = await storage.getActivityById(id, userId);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    const updatedActivity = await storage.updateActivityDownloadCount(id);
    return res.json(updatedActivity);
  } catch (error) {
    console.error("Error updating download count:", error);
    return res.status(500).json({ message: "Failed to update download count" });
  }
});

export default router;