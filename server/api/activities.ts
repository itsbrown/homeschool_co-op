import express from "express";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { storage } from "../storage";
import { checkOpenAIStatus, generateEducationalActivity } from "../services/openai";
import { InsertActivity } from "../../shared/schema";
import backgroundTaskManager from "../services/backgroundTasks";

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
        const kb = await storage.getKnowledgeBase(id);
        if (kb) {
          return `KNOWLEDGE BASE: ${kb.title}\nSUBJECT: ${kb.subject}\n\nCONTENT:\n${JSON.stringify(kb.metadata || {})}\n\n`;
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
      type: params.activityType as "worksheet" | "crossword" | "coloring" | "wordsearch" | "maze",
      subject: params.subject,
      difficulty: params.difficulty as "beginner" | "intermediate" | "advanced",
      ageRange: params.ageRange,
      content: generatedActivity,
      url: `/uploads/activities/${filename}`,
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

// Import Anthropic Service
import { isAnthropicAvailable } from "../services/anthropicService";

// Generate activity
router.post("/generate", async (req, res) => {
  try {
    // Allow generation for both authenticated and unauthenticated users
    // Use userId if available, otherwise use a default guest ID
    const userId = req.session?.userId || 0; // Use 0 as guest user ID

    const validationResult = ActivityGenerationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid activity generation parameters", 
        errors: validationResult.error.errors 
      });
    }

    // Check both AI services (OpenAI and Anthropic)
    const openaiStatus = await checkOpenAIStatus();
    const anthropicAvailable = isAnthropicAvailable();
    
    // If both services are unavailable, return error
    if (!openaiStatus.available && !anthropicAvailable) {
      return res.status(503).json({ 
        success: false, 
        error: "AI services are not available. Please check your API keys." 
      });
    }
    
    // If OpenAI is unavailable but Anthropic is available, inform user about fallback
    if (!openaiStatus.available && anthropicAvailable) {
      console.log("OpenAI service unavailable. Will use Anthropic/Claude as fallback.");
    }

    // Queue the activity generation as a background task
    const jobId = backgroundTaskManager.queueActivityGeneration({
      ...validationResult.data,
      userId
    });

    // Return immediately with the job ID and service info
    return res.json({
      success: true,
      jobId,
      services: {
        primary: openaiStatus.available ? "openai" : "anthropic",
        fallback: openaiStatus.available && anthropicAvailable ? "anthropic" : null,
        status: openaiStatus.available ? "using_primary" : "using_fallback"
      },
      message: openaiStatus.available 
        ? "Activity generation has been queued and will be processed in the background."
        : "Activity generation has been queued using our fallback AI service (Anthropic/Claude)."
    });
  } catch (error) {
    console.error("Error queuing activity generation:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ 
      success: false,
      message: "Failed to queue activity generation", 
      error: errorMessage,
      suggestion: "Please try again later or contact support."
    });
  }
});

// Check job status
router.get("/job/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const job = backgroundTaskManager.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Add additional context information to help the frontend display better messages
    const response = {
      ...job,
      message: undefined
    };
    
    if (job.status === 'queued') {
      response.message = "Activity generation is queued. Please wait...";
    } else if (job.status === 'processing' || job.status === 'running') {
      response.message = "Activity generation is in progress. Please wait...";
    } else if (job.status === 'failed') {
      response.message = "Activity generation failed. Please try again with different parameters.";
    } else if (job.status === 'completed') {
      response.message = "Activity generation completed successfully.";
    }
    
    res.json(response);
  } catch (error) {
    console.error("Error checking job status:", error);
    res.status(500).json({ error: 'Failed to check job status' });
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

// Generate PDF for activity
router.post("/:id/generate-pdf", async (req, res) => {
  try {
    console.log('PDF generation request received');
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      console.error('Invalid activity ID:', req.params.id);
      return res.status(400).json({ message: "Invalid activity ID" });
    }
    console.log('Valid activity ID:', id);

    // Get the user ID from the session if available, otherwise use 0 for public access
    const userId = req.session?.userId || 0;
    console.log(`PDF generation request from user ID: ${userId}`);

    // Check if the activity exists before attempting to generate a PDF
    const activity = await storage.getActivityById(id, userId);
    if (!activity) {
      console.error(`Activity ${id} not found or not accessible by user ${userId}`);
      return res.status(404).json({ message: "Activity not found or not accessible" });
    }
    
    console.log(`Found activity: ${activity.title}, preparing to generate PDF...`);

    // Import pdfGenerator service here to avoid circular imports
    console.log('Importing pdfGenerator service...');
    const { generateWorksheetPDF } = await import("../services/pdfGenerator");
    
    // Generate the PDF for the activity
    console.log('Calling generateWorksheetPDF...');
    try {
      const pdfUrl = await generateWorksheetPDF(id, userId);
      console.log('PDF generated successfully, URL:', pdfUrl);
      
      if (!pdfUrl) {
        console.error('PDF generation returned no URL');
        return res.status(500).json({ message: "Failed to generate PDF - no URL returned" });
      }
      
      // Double-check that the URL was stored with the activity
      const updatedActivity = await storage.getActivityById(id, userId);
      if (!updatedActivity?.pdfUrl) {
        console.warn(`PDF URL (${pdfUrl}) was not properly saved to activity`);
      } else {
        console.log(`Confirmed PDF URL saved: ${updatedActivity.pdfUrl}`);
      }
      
      return res.json({ pdfUrl });
    } catch (pdfError) {
      console.error("Error in PDF generation function:", pdfError);
      return res.status(500).json({ 
        message: "Failed to generate PDF", 
        error: pdfError instanceof Error ? pdfError.message : String(pdfError) 
      });
    }
  } catch (error) {
    console.error("Error in PDF generation endpoint:", error);
    return res.status(500).json({ 
      message: "Failed to generate PDF", 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;