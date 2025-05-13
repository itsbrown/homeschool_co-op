import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import { z } from "zod";
import { insertUserSchema, insertCurriculumSchema, insertLessonSchema, insertEventSchema, insertMarketplaceItemSchema, insertKnowledgeBaseSchema, insertChildSchema, insertEmergencyContactSchema, insertProgramSchema, insertProgramEnrollmentSchema } from "@shared/schema";
import childrenRouter from "./api/children";
import * as emergencyContactsApi from "./api/emergency-contacts";
import * as programsApi from "./api/programs";
import * as programEnrollmentsApi from "./api/program-enrollments";
import * as csvUploadApi from "./api/csv-upload";
import aiPricingRouter from "./api/ai-pricing";
import adminClassesRouter from "./api/admin-classes";
import classesRouter from "./api/classes";
import activitiesRouter from "./api/activities";
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import stream from 'stream';
import { promisify } from 'util';
import Stripe from "stripe";

declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "your-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    })
  );
  
  // Middleware to check authentication
  const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
  
  // Middleware to check role
  const hasRole = (roles: string[]) => {
    return (req, res, next) => {
      if (req.session.userId && roles.includes(req.session.userRole)) {
        return next();
      }
      res.status(403).json({ message: "Forbidden" });
    };
  };
  
  // AI Status endpoint
  app.get("/api/ai/status", async (req, res) => {
    try {
      // Dynamically import the Anthropic and OpenAI services to check availability
      const { isAnthropicAvailable } = await import("./services/anthropicService");
      const { checkOpenAIStatus } = await import("./services/openai");
      
      const anthropicAvailable = isAnthropicAvailable();
      const openaiStatus = await checkOpenAIStatus();
      
      return res.status(200).json({
        anthropic: {
          available: anthropicAvailable,
          status: anthropicAvailable ? 'operational' : 'unavailable',
          message: anthropicAvailable 
            ? 'Anthropic API is available and operational' 
            : 'Anthropic API is currently unavailable, using fallback mechanisms'
        },
        openai: openaiStatus
      });
    } catch (error) {
      console.error('Error checking AI status:', error);
      return res.status(500).json({ 
        message: 'Failed to check AI service status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      
      // Create user
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword
      });
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      res.status(201).json({ message: "User created successfully", user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating user" });
    }
  });
  
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log("Login attempt for user:", username);
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log("User not found:", username);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      console.log("User found, checking password");
      
      // Test direct comparison for test accounts with password "password"
      const testAccounts = ["admin", "learner", "parent", "educator"];
      if (testAccounts.includes(username) && password === "password") {
        console.log(`Test account login success for ${username}`);
        
        // Set session data
        req.session.userId = user.id;
        req.session.userRole = user.role;
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        
        return res.status(200).json({ message: "Login successful", user: userWithoutPassword });
      }
      
      const passwordValid = await bcrypt.compare(password, user.password);
      console.log("Password valid:", passwordValid);
      
      if (!passwordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Set session data
      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      res.status(200).json({ message: "Login successful", user: userWithoutPassword });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Error during login" });
    }
  });
  
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Error during logout" });
      }
      res.status(200).json({ message: "Logout successful" });
    });
  });
  
  app.get("/api/auth/me", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      res.status(200).json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Error fetching user data" });
    }
  });
  
  // Curriculum routes
  app.post("/api/curricula", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCurriculumSchema.parse(req.body);
      
      const curriculum = await storage.createCurriculum({
        ...validatedData,
        authorId: req.session.userId
      });
      
      res.status(201).json(curriculum);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating curriculum" });
    }
  });
  
  app.get("/api/curricula", isAuthenticated, async (req, res) => {
    try {
      const curricula = await storage.getCurriculaByAuthor(req.session.userId);
      res.status(200).json(curricula);
    } catch (error) {
      res.status(500).json({ message: "Error fetching curricula" });
    }
  });
  
  app.get("/api/curricula/:id", isAuthenticated, async (req, res) => {
    try {
      const curriculumId = parseInt(req.params.id);
      const curriculum = await storage.getCurriculum(curriculumId);
      
      if (!curriculum) {
        return res.status(404).json({ message: "Curriculum not found" });
      }
      
      // Check if user is author or curriculum is public
      if (curriculum.authorId !== req.session.userId && !curriculum.isPublic) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.status(200).json(curriculum);
    } catch (error) {
      res.status(500).json({ message: "Error fetching curriculum" });
    }
  });
  
  // AI curriculum generation
  app.post("/api/curricula/generate", isAuthenticated, async (req, res) => {
    try {
      console.log("AI Curriculum Generation - Request received", { userId: req.session.userId });
      const { subject, gradeLevel, learningStyles, additionalDetails, knowledgeBaseIds } = req.body;
      
      // Validate form data
      if (!subject || !gradeLevel || !learningStyles || learningStyles.length === 0) {
        return res.status(400).json({
          message: "Required fields are missing",
          requiredFields: ["subject", "gradeLevel", "learningStyles"]
        });
      }
      
      console.log("AI Curriculum Generation - Validation passed, attempting to import services");
      
      // Import services
      const { generateCurriculumTemplate, curriculumTemplateToDbFormat, lessonTemplateToDbFormat } = await import("./services/curriculumService");
      
      console.log("AI Curriculum Generation - Services imported, calling template generator");
      
      // Log knowledge base IDs if provided
      if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
        console.log(`Including ${knowledgeBaseIds.length} knowledge base(s) in curriculum generation:`, knowledgeBaseIds);
      }
      
      // Declare variables in outer scope
      let curriculumTemplate;
      let curriculumData;
      let curriculum;
      
      try {
        // Generate curriculum template
        curriculumTemplate = await generateCurriculumTemplate({ 
          subject, 
          gradeLevel, 
          learningStyles, 
          additionalDetails,
          knowledgeBaseIds 
        });
        
        console.log("AI Curriculum Generation - Template generated successfully");
        
        // Convert to database format
        curriculumData = curriculumTemplateToDbFormat(curriculumTemplate, req.session.userId);
        
        // Save to database
        curriculum = await storage.createCurriculum(curriculumData);
        console.log("AI Curriculum Generation - Saved to database successfully");
      } catch (templateError) {
        console.error("Error generating curriculum template:", templateError);
        return res.status(500).json({ 
          message: "Failed to generate curriculum", 
          error: templateError.message 
        });
      }
      
      try {
        // Create associated lessons
        for (const unit of curriculumTemplate.units) {
          for (const lessonTemplate of unit.lessons) {
            const lessonData = lessonTemplateToDbFormat(
              lessonTemplate,
              unit.title,
              curriculum.id,
              req.session.userId,
              curriculumData.subject,
              curriculumData.gradeLevel
            );
            
            await storage.createLesson(lessonData);
          }
        }
        
        res.status(201).json(curriculum);
      } catch (lessonError) {
        console.error("Error creating lessons:", lessonError);
        // Return success with curriculum but note that lessons failed
        return res.status(201).json({ 
          curriculum,
          warning: "Curriculum was created but some lessons failed to be generated"
        });
      }
    } catch (error) {
      console.error("Generate curriculum error:", error);
      res.status(500).json({ 
        message: "Error generating curriculum", 
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Lesson routes
  app.post("/api/lessons", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertLessonSchema.parse(req.body);
      
      const lesson = await storage.createLesson({
        ...validatedData,
        authorId: req.session.userId
      });
      
      res.status(201).json(lesson);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating lesson" });
    }
  });
  
  app.get("/api/lessons", isAuthenticated, async (req, res) => {
    try {
      const lessons = await storage.getLessonsByAuthor(req.session.userId);
      res.status(200).json(lessons);
    } catch (error) {
      res.status(500).json({ message: "Error fetching lessons" });
    }
  });
  
  app.get("/api/lessons/:id", isAuthenticated, async (req, res) => {
    try {
      const lessonId = parseInt(req.params.id);
      const lesson = await storage.getLesson(lessonId);
      
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }
      
      // Check if user is author
      if (lesson.authorId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.status(200).json(lesson);
    } catch (error) {
      res.status(500).json({ message: "Error fetching lesson" });
    }
  });
  
  app.get("/api/lessons/curriculum/:curriculumId", isAuthenticated, async (req, res) => {
    try {
      const curriculumId = parseInt(req.params.curriculumId);
      
      // Verify access to curriculum
      const curriculum = await storage.getCurriculum(curriculumId);
      
      if (!curriculum) {
        return res.status(404).json({ message: "Curriculum not found" });
      }
      
      // Check if user is author or curriculum is public
      if (curriculum.authorId !== req.session.userId && !curriculum.isPublic) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const lessons = await storage.getLessonsByCurriculum(curriculumId);
      res.status(200).json(lessons);
    } catch (error) {
      res.status(500).json({ message: "Error fetching lessons for curriculum" });
    }
  });
  
  // Event routes
  app.post("/api/events", isAuthenticated, async (req, res) => {
    try {
      // Parse dates before validation
      const data = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
      };
      
      const validatedData = insertEventSchema.parse(data);
      
      const event = await storage.createEvent({
        ...validatedData,
        organizerId: req.session.userId
      });
      
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ message: "Error creating event" });
    }
  });
  
  app.get("/api/events/upcoming", isAuthenticated, async (req, res) => {
    try {
      const events = await storage.getUpcomingEvents(req.session.userId);
      res.status(200).json(events);
    } catch (error) {
      res.status(500).json({ message: "Error fetching upcoming events" });
    }
  });
  
  app.get("/api/events", async (req, res) => {
    try {
      // For demo purposes, use a default user ID if not authenticated
      const userId = req.session?.userId || 1;
      const events = await storage.getAllEvents(userId);
      res.status(200).json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Error fetching all events" });
    }
  });
  
  // Marketplace routes
  app.post("/api/marketplace", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertMarketplaceItemSchema.parse(req.body);
      
      const item = await storage.createMarketplaceItem({
        ...validatedData,
        sellerId: req.session.userId
      });
      
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating marketplace item" });
    }
  });
  
  app.get("/api/marketplace/top", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const items = await storage.getTopSellingItems(limit);
      res.status(200).json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching top selling items" });
    }
  });
  
  app.get("/api/marketplace/seller", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getMarketplaceItemsBySeller(req.session.userId);
      res.status(200).json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching seller's items" });
    }
  });

  // Virtual tutor routes
  app.post("/api/tutor/ask", isAuthenticated, async (req, res) => {
    try {
      const { message, subject, gradeLevel } = req.body;
      
      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }
      
      // Import tutorService dynamically to prevent circular dependencies
      const { getAITutorResponse } = await import("./services/tutorService");
      const response = await getAITutorResponse(message, subject, gradeLevel);
      
      res.status(200).json({ response });
    } catch (error) {
      console.error("Tutor response error:", error);
      res.status(500).json({ message: "Error getting tutor response" });
    }
  });

  app.post("/api/tutor/resources", isAuthenticated, async (req, res) => {
    try {
      const { topic, subject, gradeLevel, learningStyle } = req.body;
      
      if (!topic || !subject || !gradeLevel) {
        return res.status(400).json({ 
          message: "Required fields are missing", 
          requiredFields: ["topic", "subject", "gradeLevel"] 
        });
      }
      
      // Import tutorService dynamically to prevent circular dependencies
      const { getSuggestedResources } = await import("./services/tutorService");
      const resources = await getSuggestedResources(topic, subject, gradeLevel, learningStyle);
      
      res.status(200).json({ resources });
    } catch (error) {
      console.error("Resource suggestions error:", error);
      res.status(500).json({ message: "Error getting resource suggestions" });
    }
  });
  
  // Knowledge Base routes
  app.get("/api/knowledge-bases/public", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const knowledgeBases = await storage.getPublicKnowledgeBases(limit);
      res.status(200).json(knowledgeBases);
    } catch (error) {
      console.error("Error fetching public knowledge bases:", error);
      res.status(500).json({ message: "Error fetching public knowledge bases" });
    }
  });
  
  app.get("/api/knowledge-bases/subjects", async (req, res) => {
    try {
      // Get all public knowledge bases to extract unique subjects
      const knowledgeBases = await storage.getPublicKnowledgeBases();
      
      // Extract unique subjects
      let subjects = [...new Set(knowledgeBases.map(kb => kb.subject))];
      
      // Add some default subjects if none found (for a better UX)
      if (!subjects.length) {
        subjects = ["Mathematics", "Science", "Language Arts", "History", "Computer Science"];
      }
      
      res.status(200).json(subjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Error fetching subjects" });
    }
  });
  
  app.get("/api/knowledge-bases/subject/:subject", async (req, res) => {
    try {
      const { subject } = req.params;
      const knowledgeBases = await storage.getKnowledgeBasesBySubject(subject);
      res.status(200).json(knowledgeBases);
    } catch (error) {
      console.error("Error fetching knowledge bases by subject:", error);
      res.status(500).json({ message: "Error fetching knowledge bases" });
    }
  });
  
  app.get("/api/knowledge-bases/author/:authorId", isAuthenticated, async (req, res) => {
    try {
      const { authorId } = req.params;
      
      // If requesting own knowledge bases, use session user ID
      const targetAuthorId = authorId === "me" ? req.session.userId : parseInt(authorId);
      
      const knowledgeBases = await storage.getKnowledgeBasesByAuthor(targetAuthorId);
      res.status(200).json(knowledgeBases);
    } catch (error) {
      console.error("Error fetching knowledge bases by author:", error);
      res.status(500).json({ message: "Error fetching knowledge bases" });
    }
  });
  
  // Combined endpoint to get all accessible knowledge bases for the user (public + owned)
  app.get("/api/knowledge-bases/all", isAuthenticated, async (req, res) => {
    try {
      let publicKnowledgeBases = [];
      let userKnowledgeBases = [];
      
      try {
        // Get public knowledge bases
        publicKnowledgeBases = await storage.getPublicKnowledgeBases();
      } catch (publicError) {
        console.error("Error fetching public knowledge bases:", publicError);
        // Continue with empty array if failed
      }
      
      try {
        // Get user's knowledge bases if user is authenticated
        if (req.session.userId) {
          userKnowledgeBases = await storage.getKnowledgeBasesByAuthor(req.session.userId);
        }
      } catch (userError) {
        console.error("Error fetching user knowledge bases:", userError);
        // Continue with empty array if failed
      }
      
      // Combine and deduplicate knowledge bases
      const combinedKnowledgeBases = [...publicKnowledgeBases];
      
      // Add user's knowledge bases that aren't already in the list
      userKnowledgeBases.forEach(userKb => {
        if (!combinedKnowledgeBases.some(kb => kb.id === userKb.id)) {
          combinedKnowledgeBases.push(userKb);
        }
      });
      
      // Return empty array if none found
      res.status(200).json(combinedKnowledgeBases);
    } catch (error) {
      console.error("Error fetching combined knowledge bases:", error);
      // Return empty array instead of error status to avoid breaking the UI
      res.status(200).json([]);
    }
  });
  
  app.get("/api/knowledge-bases/:id", async (req, res) => {
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
  });
  
  app.post("/api/knowledge-bases", isAuthenticated, async (req, res) => {
    try {
      console.log("Received knowledge base creation request from:", req.session.userId);
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("Session:", JSON.stringify(req.session, null, 2));
      
      // Check if user ID is available in session
      if (!req.session.userId) {
        console.log("User not authenticated in session");
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      try {
        console.log("Attempting to validate data with schema");
        console.log("Schema expects:", Object.keys(insertKnowledgeBaseSchema.shape).join(", "));
        console.log("Received fields:", Object.keys(req.body).join(", "));
        
        const validatedData = insertKnowledgeBaseSchema.parse(req.body);
        console.log("Validation passed, creating knowledge base with data:", JSON.stringify(validatedData, null, 2));
        
        const knowledgeBase = await storage.createKnowledgeBase({
          ...validatedData,
          authorId: req.session.userId
        });
        
        console.log("Knowledge base created with ID:", knowledgeBase.id);
        res.status(201).json(knowledgeBase);
      } catch (zodError) {
        if (zodError instanceof z.ZodError) {
          console.error("Validation error:", JSON.stringify(zodError.errors, null, 2));
          return res.status(400).json({ 
            message: "Validation error", 
            errors: zodError.errors 
          });
        }
        console.error("Non-Zod error during validation:", zodError);
        throw zodError;
      }
    } catch (error) {
      console.error("Error creating knowledge base:", error);
      res.status(500).json({ 
        message: "Error creating knowledge base",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  app.patch("/api/knowledge-bases/:id", isAuthenticated, async (req, res) => {
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
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating knowledge base:", error);
      res.status(500).json({ message: "Error updating knowledge base" });
    }
  });
  

  
  // Add GET method for download endpoint that creates and serves a zip file
  app.get("/api/knowledge-bases/:id/download", async (req, res) => {
    try {
      const knowledgeBaseId = parseInt(req.params.id);
      const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);
      
      if (!knowledgeBase) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }
      
      // Increment the download count
      const updatedKnowledgeBase = await storage.incrementDownloadCount(knowledgeBaseId);
      
      // Check if there are files to download
      if (!knowledgeBase.files || !Array.isArray(knowledgeBase.files) || knowledgeBase.files.length === 0) {
        return res.status(200).json({ 
          success: true, 
          message: "No files available for download",
          files: [],
          downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
        });
      }
      
      // If there's only one file, return info to download directly
      if (knowledgeBase.files.length === 1) {
        return res.status(200).json({ 
          success: true,
          singleFile: true,
          files: knowledgeBase.files,
          downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
        });
      }
      
      // For multiple files, prepare a JSON response that includes file info 
      // (the client will handle zipping on the frontend since we're using direct URLs)
      return res.status(200).json({ 
        success: true,
        singleFile: false,
        files: knowledgeBase.files,
        title: knowledgeBase.title,
        downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
      });
    } catch (error) {
      console.error("Error processing download:", error);
      res.status(500).json({ message: "Error processing download" });
    }
  });
  
  // Keep the POST version for backward compatibility
  app.post("/api/knowledge-bases/:id/download", async (req, res) => {
    try {
      const knowledgeBaseId = parseInt(req.params.id);
      const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);
      
      if (!knowledgeBase) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }
      
      // Increment the download count
      const updatedKnowledgeBase = await storage.incrementDownloadCount(knowledgeBaseId);
      
      // Check if there are files to download
      if (!knowledgeBase.files || !Array.isArray(knowledgeBase.files) || knowledgeBase.files.length === 0) {
        return res.status(200).json({ 
          success: true, 
          message: "No files available for download",
          files: [],
          downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
        });
      }
      
      // If there's only one file, return info to download directly
      if (knowledgeBase.files.length === 1) {
        return res.status(200).json({ 
          success: true,
          singleFile: true,
          files: knowledgeBase.files,
          downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
        });
      }
      
      // For multiple files, prepare a JSON response that includes file info
      // (the client will handle zipping on the frontend since we're using direct URLs)
      return res.status(200).json({ 
        success: true,
        singleFile: false,
        files: knowledgeBase.files,
        title: knowledgeBase.title,
        downloadCount: updatedKnowledgeBase?.downloadCount || knowledgeBase.downloadCount + 1 
      });
    } catch (error) {
      console.error("Error processing download:", error);
      res.status(500).json({ message: "Error processing download" });
    }
  });
  
  // Initialize Stripe
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('Missing STRIPE_SECRET_KEY environment variable. Stripe payments will not work.');
  }
  
  const stripe = process.env.STRIPE_SECRET_KEY ? 
    new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : 
    null;

  // Create payment intent for knowledge base purchase
  app.post("/api/create-payment-intent", isAuthenticated, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe is not configured" });
      }

      const { amount, knowledgeBaseId, title } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }
      
      // Create a payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        metadata: {
          knowledgeBaseId: knowledgeBaseId.toString(),
          userId: req.session.userId.toString(),
          title: title || "Knowledge Base Purchase"
        }
      });
      
      res.status(200).json({ 
        clientSecret: paymentIntent.client_secret
      });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ 
        message: "Error creating payment intent", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Process knowledge base purchase (post-payment)
  app.post("/api/knowledge-bases/:id/purchase", isAuthenticated, async (req, res) => {
    try {
      const knowledgeBaseId = parseInt(req.params.id);
      const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);
      
      if (!knowledgeBase) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }
      
      // Check if payment was successful (can be expanded to validate with Stripe)
      const { paymentIntentId } = req.body;
      
      if (stripe && paymentIntentId) {
        // Verify the payment intent if provided
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({ message: "Payment not successful" });
        }
        
        // Check that the metadata matches
        if (paymentIntent.metadata.knowledgeBaseId !== knowledgeBaseId.toString() ||
            paymentIntent.metadata.userId !== req.session.userId.toString()) {
          return res.status(400).json({ message: "Payment validation failed" });
        }
      }
      
      // Record the purchase
      await storage.addPurchaser(knowledgeBaseId, req.session.userId);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error recording purchase:", error);
      res.status(500).json({ message: "Error recording purchase" });
    }
  });

  // Children routes
  app.use('/api/children', childrenRouter);

  // Emergency Contacts routes
  app.get('/api/emergency-contacts', isAuthenticated, emergencyContactsApi.getMyEmergencyContacts);
  app.get('/api/emergency-contacts/:id', isAuthenticated, emergencyContactsApi.getEmergencyContactById);
  app.post('/api/emergency-contacts', isAuthenticated, emergencyContactsApi.createEmergencyContact);
  app.put('/api/emergency-contacts/:id', isAuthenticated, emergencyContactsApi.updateEmergencyContact);
  app.delete('/api/emergency-contacts/:id', isAuthenticated, emergencyContactsApi.deleteEmergencyContact);

  // Programs routes
  app.get('/api/programs', programsApi.getPublishedPrograms); // Public endpoint to browse programs
  app.get('/api/programs/:id', programsApi.getProgramById); // Public endpoint to view single program
  app.get('/api/my-programs', isAuthenticated, hasRole(['educator', 'admin']), programsApi.getMyPrograms);
  app.post('/api/programs', isAuthenticated, hasRole(['educator', 'admin']), programsApi.createProgram);
  app.put('/api/programs/:id', isAuthenticated, hasRole(['educator', 'admin']), programsApi.updateProgram);
  app.delete('/api/programs/:id', isAuthenticated, hasRole(['educator', 'admin']), programsApi.deleteProgram);

  // Program Enrollments routes
  app.get('/api/enrollments', isAuthenticated, programEnrollmentsApi.getMyChildrenEnrollments);
  app.get('/api/programs/:programId/enrollments', isAuthenticated, hasRole(['educator', 'admin']), programEnrollmentsApi.getProgramEnrollments);
  app.get('/api/enrollments/:id', isAuthenticated, programEnrollmentsApi.getEnrollmentById);
  app.post('/api/enrollments', isAuthenticated, programEnrollmentsApi.createEnrollment);
  app.put('/api/enrollments/:id', isAuthenticated, programEnrollmentsApi.updateEnrollment);
  app.delete('/api/enrollments/:id', isAuthenticated, hasRole(['admin']), programEnrollmentsApi.deleteEnrollment);

  // Register API routers
  app.use("/api/classes", classesRouter);
  app.use("/api/ai", aiPricingRouter);
  app.use("/api/admin", adminClassesRouter);
  app.use("/api/activities", activitiesRouter);
  
  // CSV Upload routes
  app.post('/api/admin/upload/classes', isAuthenticated, hasRole(['admin']), csvUploadApi.uploadClassesCsv);
  
  const httpServer = createServer(app);
  return httpServer;
}
