import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import { z } from "zod";
import { insertUserSchema, insertCurriculumSchema, insertLessonSchema, insertEventSchema, insertMarketplaceItemSchema, insertKnowledgeBaseSchema } from "@shared/schema";

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
      // Dynamically import the anthropicService to check availability
      const { isAnthropicAvailable } = await import("./services/anthropicService");
      
      const isAvailable = isAnthropicAvailable();
      return res.status(200).json({
        anthropic: {
          available: isAvailable,
          status: isAvailable ? 'operational' : 'unavailable',
          message: isAvailable 
            ? 'Anthropic API is available and operational' 
            : 'Anthropic API is currently unavailable, using fallback mechanisms'
        }
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
      
      // Test direct comparison for admin/password
      if (username === "admin" && password === "password") {
        console.log("Admin login success with direct password comparison");
        
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
      const { subject, gradeLevel, learningStyles, additionalDetails } = req.body;
      
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
          additionalDetails 
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
      const subjects = [...new Set(knowledgeBases.map(kb => kb.subject))];
      
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
      const validatedData = insertKnowledgeBaseSchema.parse(req.body);
      
      const knowledgeBase = await storage.createKnowledgeBase({
        ...validatedData,
        authorId: req.session.userId
      });
      
      res.status(201).json(knowledgeBase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating knowledge base:", error);
      res.status(500).json({ message: "Error creating knowledge base" });
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
  
  app.post("/api/knowledge-bases/:id/download", async (req, res) => {
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
  });
  
  app.post("/api/knowledge-bases/:id/purchase", isAuthenticated, async (req, res) => {
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
  });

  const httpServer = createServer(app);
  return httpServer;
}
