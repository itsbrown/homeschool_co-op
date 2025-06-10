import express from "express";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { storage } from "../storage";
import { checkOpenAIStatus, generateEducationalActivity } from "../services/openai";
import { InsertActivity } from "../../shared/schema";
// Background task manager removed for stability
import { generateActivityWithOCR, saveFileForOCR } from "../services/ocrActivityGenerator";
import { isDocumentAIAvailable } from "../services/documentAI";
import * as fileUpload from "express-fileupload";
import { UploadedFile } from "express-fileupload";
import { processKnowledgeBases } from "../services/knowledgeBaseExtraction";

const router = express.Router();

// Configure file upload middleware
router.use(fileUpload.default({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: path.join(process.cwd(), 'uploads', 'temp'),
  createParentPath: true,
}));

// Schema for activity generation request
const ActivityGenerationSchema = z.object({
  subject: z.string(),
  ageRange: z.string(),
  activityType: z.string(),
  difficulty: z.string(),
  instructions: z.string(),
  knowledgeBaseIds: z.array(z.number()).optional().default([]),
  useOCR: z.boolean().optional().default(false),
});

type ActivityGenerationRequest = z.infer<typeof ActivityGenerationSchema>;

// Fetch content from selected knowledge bases with enhanced semantic understanding
async function getKnowledgeBaseContent(knowledgeBaseIds: number[], userId: number, subject?: string, ageRange?: string): Promise<string> {
  if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) {
    return "";
  }

  try {
    // First get all knowledge bases
    const knowledgeBases = await Promise.all(
      knowledgeBaseIds.map(async (id) => {
        return await storage.getKnowledgeBase(id);
      })
    );
    
    // Filter out any undefined values
    const validKnowledgeBases = knowledgeBases.filter(kb => kb !== undefined);
    
    if (validKnowledgeBases.length === 0) {
      console.warn("No valid knowledge bases found with the provided IDs");
      return "";
    }
    
    // If we have subject and age range, use enhanced processing
    if (subject && ageRange) {
      console.log(`Applying enhanced semantic processing for subject: ${subject}, age range: ${ageRange}`);
      
      try {
        // Process knowledge bases with enhanced semantic understanding
        const processedContent = await processKnowledgeBases(
          validKnowledgeBases, 
          subject,
          ageRange
        );
        
        // Return the enriched content which includes summary, entities, and questions
        return processedContent.enrichedContent;
      } catch (processingError) {
        console.error("Error in semantic knowledge base processing:", processingError instanceof Error ? processingError.message : String(processingError));
        
        // Fall back to basic extraction if enhanced processing fails
        console.log("Falling back to basic knowledge base extraction");
      }
    }
    
    // Basic extraction (fallback or when subject/ageRange not provided)
    const contentChunks = validKnowledgeBases.map(kb => {
      // Extract content from metadata or other fields
      const kbContent = kb.metadata ? JSON.stringify(kb.metadata) : '{}';
      return `KNOWLEDGE BASE: ${kb.title}\nSUBJECT: ${kb.subject}\n\nCONTENT:\n${kbContent}\n\n`;
    });
    
    return contentChunks.join("\n");
  } catch (error) {
    console.error("Error fetching knowledge base content:", error instanceof Error ? error.message : String(error));
    return "";
  }
}

// Generate activity using AI
async function generateActivity(params: ActivityGenerationRequest, userId: number, filePath?: string) {
  try {
    // Check OpenAI status
    const openaiStatus = await checkOpenAIStatus();
    if (!openaiStatus.available) {
      return { 
        success: false, 
        error: "OpenAI service is not available. Please check your API key." 
      };
    }

    // Get content from knowledge bases with enhanced semantic understanding
    const knowledgeBaseContent = await getKnowledgeBaseContent(
      params.knowledgeBaseIds || [], 
      userId,
      params.subject,
      params.ageRange
    );
    
    let generatedActivity: any;
    
    // Check if OCR should be used
    if (params.useOCR && filePath) {
      console.log(`Generating activity with OCR processing from file: ${filePath}`);
      
      // Generate activity using OCR-extracted text and OpenAI
      generatedActivity = await generateActivityWithOCR(
        params.subject,
        params.ageRange,
        params.activityType,
        params.difficulty,
        params.instructions,
        filePath,
        knowledgeBaseContent
      );
    } else {
      // Standard activity generation without OCR
      generatedActivity = await generateEducationalActivity(
        params.subject,
        params.ageRange,
        params.activityType,
        params.difficulty,
        params.instructions,
        knowledgeBaseContent
      );
    }

    // Create a folder for storing generated activities if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads");
    const activitiesDir = path.join(uploadsDir, "activities");
    
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(activitiesDir, { recursive: true });
    } catch (error) {
      console.error("Error creating directories:", error instanceof Error ? error.message : String(error));
    }

    // Store the generated activity data in a JSON file
    const timestamp = new Date().getTime();
    const filename = `${params.activityType}_${params.subject.replace(/\s+/g, '_')}_${timestamp}.json`;
    const outputFilePath = path.join(activitiesDir, filename);
    
    await fs.writeFile(outputFilePath, JSON.stringify(generatedActivity, null, 2));

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

    // Make sure to explicitly format the result with easy-to-find activity ID
    const result = {
      success: true,
      activity: savedActivity,
      activityContent: generatedActivity,
      filePath: `/uploads/activities/${filename}`,
      id: savedActivity.id // Explicitly include the ID at the top level
    };
    
    console.log(`Activity generated with ID: ${savedActivity.id}, returning structured result`);
    
    return result;
  } catch (error) {
    console.error("Error generating activity:", error instanceof Error ? error.message : String(error));
    return {
      success: false,
      error: `Failed to generate activity: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// API endpoints
router.post("/generate", async (req, res) => {
  try {
    // Validate the request body
    const validationResult = ActivityGenerationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.issues,
      });
    }

    const params = validationResult.data;
    
    // Check for user authentication
    const userId = req.session?.userId || 1; // Fallback to user ID 1 if not authenticated
    
    // Check if there's a file to process with OCR
    let ocrFilePath: string | undefined = undefined;
    
    if (params.useOCR && req.files && Object.keys(req.files).length > 0) {
      const uploadedFile = req.files.document as UploadedFile;
      
      if (uploadedFile) {
        // Save the file for OCR processing
        try {
          const buffer = Buffer.from(await fs.readFile(uploadedFile.tempFilePath));
          ocrFilePath = await saveFileForOCR(buffer, uploadedFile.name);
          console.log(`File saved for OCR processing: ${ocrFilePath}`);
        } catch (fileError) {
          console.error("Error saving uploaded file for OCR:", fileError instanceof Error ? fileError.message : String(fileError));
          return res.status(500).json({
            success: false,
            error: "Failed to save uploaded file for OCR processing"
          });
        }
      }
    }

    // Generate activity directly
    try {
      const result = await generateActivity(params, userId, ocrFilePath);
      
      if (result && 'activity' in result && result.activity) {
        return res.json({
          success: true,
          message: "Activity generated successfully",
          id: result.activity.id,
          activityId: result.activity.id,
          data: result
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Activity generation failed - no activity returned"
        });
      }
    } catch (error) {
      console.error('Activity generation error:', error);
      return res.status(500).json({
        success: false,
        message: "Activity generation failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    console.error("Error in activity generation endpoint:", error instanceof Error ? error.message : String(error));
    res.status(500).json({
      success: false,
      error: `Server error during activity generation: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

// Get activity generation job status
router.get("/job/:jobId", (req, res) => {
  const { jobId } = req.params;
  
  if (!jobId) {
    return res.status(400).json({
      success: false,
      error: "Job ID is required",
    });
  }
  
  const jobStatus = backgroundTaskManager.getJobStatus(jobId);
  
  if (!jobStatus) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }
  
  // Format the response based on job status
  let message: string;
  switch (jobStatus.status) {
    case "queued":
      message = "Activity generation is queued. Please wait...";
      break;
    case "in_progress":
      message = "Activity generation is in progress. Please wait...";
      break;
    case "failed":
      message = "Activity generation failed. Please try again with different parameters.";
      break;
    case "completed":
      message = "Activity generation completed successfully.";
      break;
    default:
      message = `Job status: ${jobStatus.status}`;
  }
  
  // Extract the activity ID if available and include it in the response
  let id = null;
  
  // Look in multiple locations for the activity ID based on different response structures
  if (jobStatus.status === "completed") {
    if (jobStatus.result?.data?.activity?.id) {
      id = jobStatus.result.data.activity.id;
      console.log('Found activity ID in job result data.activity:', id);
    } else if (jobStatus.result?.activity?.id) {
      id = jobStatus.result.activity.id;
      console.log('Found activity ID in job result activity:', id);
    } else if (jobStatus.result?.id) {
      id = jobStatus.result.id;
      console.log('Found activity ID in job result id:', id);
    } else if (jobStatus.result && 'activityId' in jobStatus.result) {
      id = (jobStatus.result as any).activityId;
      console.log('Found activity ID in job result activityId:', id);
    } else if (jobStatus.result?.data) {
      // The activity object structure might be directly in the data property
      const result = jobStatus.result.data;
      if (result.activity?.id) {
        id = result.activity.id;
        console.log('Found activity ID in result.data.activity:', id);
      } else if (result.id) {
        id = result.id;
        console.log('Found activity ID in result.data.id:', id);
      } else if (typeof result === 'object' && 'activityId' in result) {
        id = (result as any).activityId;
        console.log('Found activity ID in result.data.activityId:', id);
      }
    }
  }
  
  // Debug what's coming from the activity generation
  if (jobStatus.status === "completed") {
    console.log('Job complete. Response structure keys:', 
      Object.keys(jobStatus.result || {}),
      'Data keys:', Object.keys(jobStatus.result?.data || {}),
      'Activity keys:', Object.keys(jobStatus.result?.activity || {})
    );
    
    // Inspect nested activity object if it exists
    if (jobStatus.result?.data?.activity) {
      console.log('Activity found in result.data.activity, keys:', Object.keys(jobStatus.result.data.activity));
    }
  }
  
  res.json({
    success: true,
    status: jobStatus.status,
    message,
    result: jobStatus.result,
    id,
    activityId: id // Include both id and activityId for consistent naming
  });
});

// Document AI status endpoint
// Get activity ID directly for a job
router.get("/job/:jobId/activity-id", (req, res) => {
  const { jobId } = req.params;
  
  if (!jobId) {
    return res.status(400).json({
      success: false,
      error: "Job ID is required",
    });
  }
  
  return res.status(404).json({
    success: false,
    error: "Background job processing has been simplified - activities are now generated directly"
  });
});

router.get("/ocr-status", (_req, res) => {
  const available = isDocumentAIAvailable();
  
  res.json({
    success: true,
    ocrAvailable: available,
    message: available 
      ? "Document AI OCR service is available" 
      : "Document AI OCR service is not available. Please check credentials."
  });
});

// Get individual activity by ID
router.get("/:id", async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    
    if (isNaN(activityId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid activity ID"
      });
    }

    // Try to get the activity from storage
    const activity = await storage.getActivityById(activityId, 1); // Use default user ID for now
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: "Activity not found"
      });
    }

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch activity"
    });
  }
});

export default router;