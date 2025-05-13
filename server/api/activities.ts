import express from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { anthropicClient } from "../services/anthropic";

const router = express.Router();

// Schema for activity generation requests
const ActivityGenerationSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  ageRange: z.string().min(1, "Age range is required"),
  activityType: z.enum(["worksheet", "crossword", "coloring", "wordsearch", "maze"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  instructions: z.string().optional(),
  knowledgeBaseIds: z.array(z.number()).optional(),
});

type ActivityGenerationRequest = z.infer<typeof ActivityGenerationSchema>;

// Helper to get knowledge base content
async function getKnowledgeBaseContent(knowledgeBaseIds: number[], userId: number) {
  const contentPromises = knowledgeBaseIds.map(async (id) => {
    const kb = await storage.getKnowledgeBaseById(id, userId);
    if (!kb) return null;
    return {
      title: kb.title,
      subject: kb.subject,
      content: kb.metadata, // Assuming metadata contains the actual content
    };
  });

  const contents = await Promise.all(contentPromises);
  return contents.filter(Boolean);
}

// Helper for generating worksheets with Anthropic
async function generateWorksheet(params: ActivityGenerationRequest, userId: number) {
  const { subject, ageRange, activityType, difficulty, instructions, knowledgeBaseIds = [] } = params;
  
  let knowledgeBaseContent = "";
  if (knowledgeBaseIds.length > 0) {
    const kbContents = await getKnowledgeBaseContent(knowledgeBaseIds, userId);
    if (kbContents.length > 0) {
      knowledgeBaseContent = "Using the following knowledge base content as reference:\n\n" + 
        kbContents.map(kb => `--- ${kb?.title} ---\n${JSON.stringify(kb?.content)}`).join("\n\n");
    }
  }

  const activityTypeDescriptions: Record<string, string> = {
    worksheet: "educational worksheet with age-appropriate questions and answers",
    crossword: "crossword puzzle with age-appropriate clues and answers",
    coloring: "black-and-white coloring page with clear outlines",
    wordsearch: "word search puzzle with hidden vocabulary words",
    maze: "educational maze with checkpoints",
  };

  const ageDescription = {
    "4-5": "preschool (ages 4-5)",
    "6-7": "early elementary (ages 6-7)",
    "8-10": "elementary (ages 8-10)",
    "11-13": "middle school (ages 11-13)",
    "14-18": "high school (ages 14-18)",
  }[ageRange] || ageRange;

  let prompt = `Create a ${difficulty} level ${activityTypeDescriptions[activityType]} about "${subject}" for ${ageDescription} students.`;
  
  if (instructions) {
    prompt += `\n\nSpecific instructions: ${instructions}`;
  }
  
  if (knowledgeBaseContent) {
    prompt += `\n\n${knowledgeBaseContent}`;
  }
  
  prompt += `\n\nOutput the content in a structured JSON format that I can convert to a PDF:`;
  
  if (activityType === "worksheet") {
    prompt += `\n{
  "title": "Worksheet title",
  "instructions": "Instructions for students",
  "questions": [
    { "question": "Question 1", "answer": "Answer 1" },
    { "question": "Question 2", "answer": "Answer 2" }
  ]
}`;
  } else if (activityType === "crossword") {
    prompt += `\n{
  "title": "Crossword title",
  "instructions": "Instructions for students",
  "grid": [
    ["A", "P", "P", "L", "E"],
    ["", "", "E", "", ""],
    ["", "", "A", "", ""],
    ["", "", "R", "", ""]
  ],
  "clues": {
    "across": [{ "number": 1, "clue": "A fruit (5 letters)", "answer": "APPLE" }],
    "down": [{ "number": 1, "clue": "A vegetable (4 letters)", "answer": "PEAR" }]
  }
}`;
  } else if (activityType === "wordsearch") {
    prompt += `\n{
  "title": "Word Search title",
  "instructions": "Instructions for students",
  "grid": [
    ["A", "P", "P", "L", "E"],
    ["B", "A", "N", "A", "N"],
    ["C", "D", "E", "F", "G"]
  ],
  "words": ["APPLE", "BANANA"]
}`;
  }
  
  try {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await anthropicClient.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      messages: [
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
    });
    
    const content = response.content[0].text;
    
    try {
      // Validate the response is valid JSON
      const parsedContent = JSON.parse(content);
      return parsedContent;
    } catch (error) {
      console.error("Failed to parse AI response as JSON:", error);
      throw new Error("Invalid response format from AI service");
    }
  } catch (error) {
    console.error("Error generating activity with Anthropic:", error);
    throw error;
  }
}

// Generate a PDF from the activity content
async function generatePDF(activityContent: any, activityType: string) {
  // In a real implementation, this would use PDFKit or a similar library
  // to create a properly formatted PDF based on the activity type
  
  // For now, just create a simple JSON file as a placeholder
  const fileName = `activity_${uuidv4()}.json`;
  const filePath = path.join(__dirname, "../../uploads", fileName);
  
  // Ensure uploads directory exists
  if (!fs.existsSync(path.join(__dirname, "../../uploads"))) {
    fs.mkdirSync(path.join(__dirname, "../../uploads"), { recursive: true });
  }
  
  // Write the activity content to a file
  fs.writeFileSync(filePath, JSON.stringify(activityContent, null, 2));
  
  // In a real implementation, you would return the URL to the PDF
  return `/uploads/${fileName}`;
}

// Generate activity endpoint
router.post("/generate", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    // Validate request body
    const validation = ActivityGenerationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid request data",
        errors: validation.error.format(),
      });
    }

    const activityParams = validation.data;
    
    // Generate the activity content using Anthropic
    const activityContent = await generateWorksheet(activityParams, req.session.userId);
    
    // Convert the content to a PDF (or placeholder)
    const activityUrl = await generatePDF(activityContent, activityParams.activityType);
    
    // Save the activity to the database
    const savedActivity = await storage.createActivity({
      title: activityContent.title || `${activityParams.subject} ${activityParams.activityType}`,
      type: activityParams.activityType,
      content: activityContent,
      url: activityUrl,
      ageRange: activityParams.ageRange,
      subject: activityParams.subject,
      authorId: req.session.userId,
      difficulty: activityParams.difficulty,
      createdAt: new Date(),
    });
    
    return res.json({
      success: true,
      activity: savedActivity,
      activityUrl,
    });
  } catch (error: any) {
    console.error("Error generating activity:", error);
    return res.status(500).json({
      message: "Failed to generate activity",
      error: error.message,
    });
  }
});

// Get user's activities
router.get("/my-activities", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const activities = await storage.getActivitiesByAuthor(req.session.userId);
    return res.json(activities);
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch activities",
      error: error.message,
    });
  }
});

// Get activity by ID
router.get("/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const activityId = parseInt(req.params.id);
    if (isNaN(activityId)) {
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    const activity = await storage.getActivityById(activityId, req.session.userId);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    return res.json(activity);
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch activity",
      error: error.message,
    });
  }
});

export default router;