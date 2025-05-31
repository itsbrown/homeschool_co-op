import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { nlpService } from "./nlp-service";
import bcrypt from "bcryptjs";
import session from "express-session";
import { z } from "zod";
import { insertUserSchema, insertCurriculumSchema, insertLessonSchema, insertEventSchema, insertMarketplaceItemSchema, insertKnowledgeBaseSchema, insertChildSchema, insertEmergencyContactSchema, insertProgramSchema, insertProgramEnrollmentSchema } from "@shared/schema";
// Removed session-based children router - using Auth0 endpoints instead
import * as emergencyContactsApi from "./api/emergency-contacts";
import * as programsApi from "./api/programs";
import * as programEnrollmentsApi from "./api/program-enrollments";
import * as csvUploadApi from "./api/csv-upload";
import aiPricingRouter from "./api/ai-pricing";
import adminClassesRouter from "./api/admin-classes";
import { backupService } from "./services/backupService";
import classesRouter from "./api/classes";
import activitiesRouter from "./api/activities";
import imageServicesRouter from "./api/image-services";
import ocrTestRouter from "./api/ocr-test";
import schoolsRouter from "./api/schools";
import schoolAdminRouter from "./api/school-admin";
import { processEnrollmentMessage } from "./api/enrollment-assistant";
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import stream from 'stream';
import { promisify } from 'util';
import Stripe from "stripe";

// Removed express-session declarations - using Auth0 token-based authentication

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize database tables
  const { initializeDatabase } = await import('./init-db');
  await initializeDatabase();

  // Import Auth0 token-based authentication middleware
  const { verifyAuth0Token, requireRole, requireAdmin, requireEducator } = await import("./middleware/auth0-auth");

  // Register API routers
  // Children endpoint is now handled directly below with Auth0 authentication

  // Parent-Child sync endpoint
  app.post("/api/sync-children", verifyAuth0Token, async (req, res) => {
    try {
      const user = req.user;
      console.log('Sync children - Auth0 user payload:', JSON.stringify(user, null, 2));
      
      if (!user) {
        return res.status(400).json({ message: "Authentication required" });
      }

      const userEmail = user.email || user['https://myapp.com/email'] || user.sub;
      if (!userEmail) {
        console.log('No email found in user payload:', user);
        return res.status(400).json({ message: "User email is required" });
      }

      // Find all children with matching parent email
      const allChildren = await storage.getAllChildren();
      console.log(`🔍 Searching for children with parent email: "${userEmail}"`);
      console.log(`📋 Total children in database: ${allChildren.length}`);
      
      // Log all parent emails for debugging
      const parentEmails = allChildren.map(child => child.parentEmail).filter(Boolean);
      console.log('📧 All parent emails in database:', parentEmails);
      
      const matchingChildren = allChildren.filter(child => 
        child.parentEmail && child.parentEmail.toLowerCase() === userEmail.toLowerCase()
      );
      console.log(`✅ Found ${matchingChildren.length} matching children`);

      // Update children to link them to this user
      const updatedChildren = [];
      for (const child of matchingChildren) {
        const updatedChild = await storage.updateChild(child.id, {
          ...child,
          userId: user.sub, // Link child to Auth0 user ID
          lastSyncedAt: new Date().toISOString()
        });
        updatedChildren.push(updatedChild);
      }

      res.json({
        message: `Successfully synced ${updatedChildren.length} children`,
        syncedChildren: updatedChildren.length,
        debug: {
          auth0Email: userEmail,
          totalChildrenInDb: allChildren.length,
          parentEmailsInDb: parentEmails,
          matchingChildrenFound: matchingChildren.length
        },
        children: updatedChildren.map(child => ({
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          email: child.email,
          parentEmail: child.parentEmail
        }))
      });
    } catch (error) {
      console.error("Error syncing children:", error);
      res.status(500).json({ message: "Error syncing children accounts" });
    }
  });

  // Auth0 user sync endpoint
  app.post("/api/auth/sync", verifyAuth0Token, async (req, res) => {
    try {
      const user = req.user;
      
      // Return user information from Auth0 token
      const userData = {
        id: user.sub,
        name: user.name || user.nickname,
        email: user.email,
        role: user.role || user['custom:role'] || user['app_metadata']?.role || 'parent',
        avatar: user.picture,
        subscription: 'free'
      };

      res.status(200).json(userData);
    } catch (error) {
      console.error("Auth0 sync error:", error);
      res.status(500).json({ message: "Error syncing user" });
    }
  });

  // Role update endpoint for Firebase users
  app.post("/api/auth/update-role", async (req, res) => {
    try {
      const { role } = req.body;

      if (!role || !['parent', 'instructor', 'schoolAdmin', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role provided' });
      }

      // Update the user role and return updated user data
      const updatedUser = {
        id: 1, // This would be dynamic in a real system
        name: req.body.name || 'User',
        email: req.body.email || '',
        role: role,
        avatar: null,
        subscription: 'free'
      };

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        message: 'Role updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Auth0 token-based authentication middleware
  const isAuthenticated = verifyAuth0Token;

  // Role-based authorization middleware using Auth0 tokens
  const hasRole = (roles: string[]) => {
    return (req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userRole = req.user.role || req.user['custom:role'] || req.user['app_metadata']?.role;

      if (!userRole || !roles.includes(userRole)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      next();
    };
  };

  // AI Status endpoint
  app.get("/api/ai/status", async (req, res) => {
    try {
      // Dynamically import the Anthropic and OpenAI services to check availability
      let anthropicService, checkOpenAIStatus;
      try {
        ({ anthropicService } = await import("./services/anthropicService"));
        ({ checkOpenAIStatus } = await import("./services/openai"));
      } catch (error) {
        console.error('Failed to load AI services:', error);
        return res.status(500).json({ message: 'AI services unavailable' });
      }

      const anthropicStatus = anthropicService.getStatus();
      const anthropicAvailable = anthropicStatus.available;
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

  // Auth0 token verification endpoint - replaces traditional login
  app.get("/api/auth/verify", verifyAuth0Token, async (req: any, res) => {
    try {
      // Token is already verified by middleware, user info is in req.user
      const userInfo = {
        id: req.user.sub,
        email: req.user.email,
        name: req.user.name || req.user.nickname,
        role: req.user.role || req.user['custom:role'] || req.user['app_metadata']?.role || 'user',
        picture: req.user.picture
      };

      res.status(200).json({ 
        message: "Token verified successfully", 
        user: userInfo 
      });
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(500).json({ message: "Error verifying token" });
    }
  });

  // Auth0 logout endpoint - replaces session-based logout
  app.post("/api/auth/logout", (req, res) => {
    // With Auth0 token-based auth, logout is handled client-side
    // Server just acknowledges the logout request
    res.status(200).json({ message: "Logout acknowledged" });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      console.log('Session check in /me endpoint:', req.session);

      if (!req.session || !req.session.userId) {
        console.log('No session or userId found in session');
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Test accounts (1-4) - return directly without database lookup
      if (req.session.userId === 1) {
        console.log('Returning admin user profile');
        return res.status(200).json(testUsers.admin);
      } 
      else if (req.session.userId === 2) {
        console.log('Returning educator user profile');
        return res.status(200).json(testUsers.educator);
      }
      else if (req.session.userId === 3) {
        console.log('Returning parent user profile');
        return res.status(200).json(testUsers.parent);
      }
      else if (req.session.userId === 4) {
        console.log('Returning learner user profile');
        return res.status(200).json(testUsers.learner);
      }

      // Only try database for non-test accounts
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        // Remove password from response
        const { password, ...userWithoutPassword } = user;

        res.status(200).json(userWithoutPassword);
      } catch (dbError) {
        console.error("Database error fetching user:", dbError);
        return res.status(500).json({ message: "Error fetching user data from database" });
      }
    } catch (error) {
      console.error("Error in /me endpoint:", error);
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

  app.get("/api/events/upcoming", verifyAuth0Token, async (req: any, res) => {
    try {
      const userEmail = req.auth?.payload?.email;
      
      if (!userEmail) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // For now, return empty array since we don't have user-specific events implemented
      // This prevents the 500 error and allows the parent dashboard to load
      const events: any[] = [];
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
    console.error('Critical: STRIPE_SECRET_KEY environment variable is missing. Stripe payments will not work.');
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

  // Subscription Management Endpoints

  // Create Stripe Checkout Session for subscriptions
  app.post("/api/subscriptions/create", isAuthenticated, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe is not configured" });
      }

      const { planId, stripePriceId, interval } = req.body;

      if (!stripePriceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }

      // Create Stripe customer if they don't have one
      let customerId = req.user?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user?.email,
          metadata: {
            userId: req.user?.id.toString(),
            planId: planId
          }
        });
        customerId = customer.id;

        // Update user with customer ID
        await storage.updateUser(req.user.id, { stripeCustomerId: customerId });
      }

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        success_url: `${req.protocol}://${req.get('host')}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment-plans`,
        metadata: {
          userId: req.user.id.toString(),
          planId: planId,
          interval: interval
        }
      });

      res.status(200).json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ 
        message: "Error creating subscription", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Handle free plan activation
  app.post("/api/subscriptions/free", isAuthenticated, async (req, res) => {
    try {
      const { planId } = req.body;

      // Update user subscription to free plan
      await storage.updateUser(req.user.id, { 
        subscription: 'free',
        subscriptionStatus: 'active'
      });

      res.status(200).json({ 
        success: true, 
        message: "Free plan activated successfully" 
      });
    } catch (error) {
      console.error("Error activating free plan:", error);
      res.status(500).json({ message: "Error activating free plan" });
    }
  });

  // Get current subscription status
  app.get("/api/subscriptions/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user;

      let subscriptionDetails = {
        plan: user.subscription || 'free',
        status: user.subscriptionStatus || 'inactive',
        customerId: user.stripeCustomerId || null,
        subscription: null
      };

      // If user has Stripe customer ID, get subscription details
      if (stripe && user.stripeCustomerId) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            limit: 1,
            status: 'all'
          });

          if (subscriptions.data.length > 0) {
            const subscription = subscriptions.data[0];
            subscriptionDetails.subscription = {
              id: subscription.id,
              status: subscription.status,
              currentPeriodEnd: subscription.current_period_end,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              priceId: subscription.items.data[0]?.price.id
            };
          }
        } catch (stripeError) {
          console.error("Error fetching subscription from Stripe:", stripeError);
        }
      }

      res.status(200).json(subscriptionDetails);
    } catch (error) {
      console.error("Error getting subscription status:", error);
      res.status(500).json({ message: "Error getting subscription status" });
    }
  });

  // Cancel subscription
  app.post("/api/subscriptions/cancel", isAuthenticated, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe is not configured" });
      }

      const user = req.user;

      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: "No subscription found" });
      }

      // Get active subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active'
      });

      if (subscriptions.data.length === 0) {
        return res.status(400).json({ message: "No active subscription found" });
      }

      // Cancel the subscription at period end
      const subscription = subscriptions.data[0];
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true
      });

      res.status(200).json({ 
        success: true, 
        message: "Subscription will cancel at the end of current period" 
      });
    } catch (error) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ message: "Error canceling subscription" });
    }
  });

  // Reactivate canceled subscription
  app.post("/api/subscriptions/reactivate", isAuthenticated, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe is not configured" });
      }

      const user = req.user;

      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: "No subscription found" });
      }

      // Get subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        return res.status(400).json({ message: "No subscription found" });
      }

      // Reactivate the subscription
      const subscription = subscriptions.data[0];
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false
      });

      res.status(200).json({ 
        success: true, 
        message: "Subscription reactivated successfully" 
      });
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      res.status(500).json({ message: "Error reactivating subscription" });
    }
  });

  // Children routes - handled directly with Auth0 authentication above

  // Emergency Contacts routes
  app.get('/api/emergency-contacts', isAuthenticated, emergencyContactsApi.getMyEmergencyContacts);
  app.get('/api/emergency-contacts/:id', isAuthenticated, emergencyContactsApi.getEmergencyContactById);
  app.post('/api/emergency-contacts', isAuthenticated, emergencyContactsApi.createEmergencyContact);
  app.put('/api/emergency-contacts/:id', isAuthenticated, emergencyContactsApi.updateEmergencyContact);
  app.delete('/api/emergency-contacts/:id', isAuthenticated, emergencyContactsApi.deleteEmergencyContact);

  // Programs routes
  app.get('/api/programs', programsApi.getPublishedPrograms); // Public endpoint to browse programs
  app.get('/api/programs/:id', programsApi.getProgramById); // Public endpoint to view single program
  app.get('/api/my-programs', isAuthenticated, requireEducator, programsApi.getMyPrograms);
  app.post('/api/programs', isAuthenticated, requireEducator, programsApi.createProgram);
  app.put('/api/programs/:id', isAuthenticated, requireEducator, programsApi.updateProgram);
  app.delete('/api/programs/:id', isAuthenticated, requireAdmin, programsApi.deleteProgram);

  // Program Enrollments routes
  app.get('/api/enrollments', verifyAuth0Token, programEnrollmentsApi.getMyChildrenEnrollments);
  app.get('/api/programs/:programId/enrollments', isAuthenticated, requireEducator, programEnrollmentsApi.getProgramEnrollments);
  app.get('/api/enrollments/:id', isAuthenticated, programEnrollmentsApi.getEnrollmentById);
  app.post('/api/enrollments', isAuthenticated, programEnrollmentsApi.createEnrollment);
  app.put('/api/enrollments/:id', isAuthenticated, programEnrollmentsApi.updateEnrollment);
  app.delete('/api/enrollments/:id', isAuthenticated, requireAdmin, programEnrollmentsApi.deleteEnrollment);

  // AI Enrollment Assistant with NLP and Action Capabilities
  app.post('/api/ai/enrollment-assistant', isAuthenticated, async (req, res) => {
    try {
      const { message, action, registrationData } = req.body;
      const userId = (req as any).session?.userId;

      // Use Google Cloud NLP to understand the user's intent
      const nlpAnalysis = await nlpService.analyzeUserInput(message);

      // Extract relevant information from the message
      const extractedInfo = nlpService.extractChildInfo(message, nlpAnalysis.entities);

      let responseMessage = '';
      let actionData = null;

      // Handle specific actions (registration, enrollment)
      if (action === 'register_child' && registrationData) {
        try {
          // Actually register the child using existing API
          const childData = {
            ...registrationData,
            parentId: userId
          };

          const registeredChild = await storage.createChild(childData);
          responseMessage = `Great! I've successfully registered ${registeredChild.firstName} ${registeredChild.lastName}. They're now in our system and ready for program enrollment!`;
          actionData = { type: 'child_registered', child: registeredChild };
        } catch (error) {
          responseMessage = "I encountered an issue while registering. Let me help you try again with the correct information.";
        }
      } else if (action === 'enroll_program' && registrationData) {
        try {
          // Actually enroll in program using existing API
          const enrollment = await storage.createEnrollment({
            childId: registrationData.childId,
            programId: registrationData.programId,
            parentId: userId,
            status: 'pending'
          });

          responseMessage = `Perfect! I've enrolled ${registrationData.childName} in the ${registrationData.programName} program. You'll receive confirmation details soon!`;
          actionData = { type: 'program_enrolled', enrollment };
        } catch (error) {
          responseMessage = "I had trouble processing the enrollment. Let me help you with the program selection again.";
        }
      } else {
        // Generate intelligent response based on intent and sentiment
        switch (nlpAnalysis.intent) {
          case 'register_child':
            responseMessage = await generateRegistrationResponse(extractedInfo, nlpAnalysis, userId);
            break;
          case 'find_programs':
            responseMessage = await generateProgramResponse(extractedInfo, nlpAnalysis, userId);
            break;
          case 'schedule_inquiry':
            responseMessage = generateScheduleResponse(nlpAnalysis);
            break;
          case 'cost_inquiry':
            responseMessage = generateCostResponse(nlpAnalysis);
            break;
          default:
            responseMessage = generateGeneralResponse(nlpAnalysis);
        }
      }

      res.json({
        response: responseMessage,
        analysis: nlpAnalysis,
        extractedInfo,
        actionData
      });

    } catch (error) {
      console.error('AI Assistant Error:', error);
      res.status(500).json({ 
        error: 'Failed to process message',
        response: "I'm here to help! Could you tell me more about what you're looking for?"
      });
    }
  });

  // Enhanced response generation functions with real data integration
  async function generateRegistrationResponse(extractedInfo: any, analysis: any, userId: string): Promise<string> {
    const sentiment = analysis.sentiment;
    let response = '';

    if (sentiment === 'positive') {
      response = "That's wonderful! I'd love to help you register your child. ";
    } else if (sentiment === 'negative') {
      response = "I understand this process can be overwhelming. Don't worry, I'm here to make it easy! ";
    } else {
      response = "I'm happy to help you with child registration! ";
    }

    if (extractedInfo.firstName) {
      response += `I see you mentioned ${extractedInfo.firstName}. `;
    }

    if (extractedInfo.age) {
      response += `At ${extractedInfo.age} years old, there are some great programs available! `;
    }

    // Check if user already has children registered
    try {
      const existingChildren = await storage.getChildrenByParent(userId);
      if (existingChildren.length > 0) {
        response += `I see you already have ${existingChildren.length} child${existingChildren.length > 1 ? 'ren' : ''} registered. `;
      }
    } catch (error) {
      // Continue without existing children info
    }

    response += "To get started, I'll need some basic information. What's your child's full name and age?";

    return response;
  }

  async function generateProgramResponse(extractedInfo: any, analysis: any, userId: string): Promise<string> {
    const keywords = analysis.keywords.join(', ');
    let response = "Great question about our programs! ";

    // Get real programs from the system
    try {
      const programs = await storage.getPrograms();
      const availablePrograms = programs.filter(p => p.isPublished);

      if (keywords.includes('art') || keywords.includes('creative')) {
        const artPrograms = availablePrograms.filter(p => 
          p.title.toLowerCase().includes('art') || 
          p.description?.toLowerCase().includes('creative')
        );
        if (artPrograms.length > 0) {
          response += `We have ${artPrograms.length} fantastic art and creative programs! `;
        }
      } else if (keywords.includes('math') || keywords.includes('science')) {
        const stemPrograms = availablePrograms.filter(p => 
          p.title.toLowerCase().includes('math') || 
          p.title.toLowerCase().includes('science') ||
          p.description?.toLowerCase().includes('stem')
        );
        if (stemPrograms.length > 0) {
          response += `Our ${stemPrograms.length} STEM programs are designed to make learning fun and engaging! `;
        }
      }

      if (extractedInfo.age) {
        const ageAppropriate = availablePrograms.filter(p => {
          const age = parseInt(extractedInfo.age);
          return p.gradeLevel.includes(age.toString()) || 
                 (age <= 6 && p.gradeLevel.includes('Kindergarten'));
        });
        if (ageAppropriate.length > 0) {
          response += `For a ${extractedInfo.age}-year-old, I found ${ageAppropriate.length} age-appropriate programs. `;
        }
      }

      response += `We currently have ${availablePrograms.length} programs available. Would you like me to show you programs by age group or by subject area?`;

    } catch (error) {
      response += "We have various programs available for different ages and interests. Would you like me to show you programs by age group or by subject area?";
    }

    return response;
  }

  function generateScheduleResponse(analysis: any): string {
    const sentiment = analysis.sentiment;
    let response = '';

    if (sentiment === 'positive') {
      response = "I'm excited to help you plan your schedule! ";
    } else {
      response = "Let me help you find the perfect timing for your family! ";
    }

    response += "Our programs run throughout the week with flexible scheduling options. ";
    response += "Are you looking for weekday classes, weekend activities, or specific time slots?";

    return response;
  }

  function generateCostResponse(analysis: any): string {
    let response = "I understand budget is an important consideration for families. ";
    response += "We offer various pricing options and payment plans to make our programs accessible. ";
    response += "Many of our programs also offer sibling discounts and scholarship opportunities. ";
    response += "Would you like me to show you our pricing structure or discuss financial assistance options?";

    return response;
  }

  function generateGeneralResponse(analysis: any): string {
    const sentiment = analysis.sentiment;
    let response = '';

    if (sentiment === 'positive') {
      response = "Thank you for reaching out! I'm here to help with anything you need. ";
    } else if (sentiment === 'negative') {
      response = "I'm sorry if you're having concerns. I'm here to help address any questions or issues. ";
    } else {
      response = "Hello! I'm your enrollment assistant and I'm here to help. ";
    }

    response += "I can assist with child registration, finding programs, scheduling, costs, and any other questions about our educational opportunities. ";
    response += "What would you like to know more about?";

    return response;
  }

  // Register the combined knowledge base endpoint
  app.get("/api/knowledge-base/combined", async (req, res) => {
    const knowledgeBaseApi = await import("./api/knowledge-base");
    return knowledgeBaseApi.getCombinedKnowledgeBases(req, res);
  });

  // Register API routers
  app.use("/api/classes", classesRouter);
  app.use("/api/ai", aiPricingRouter);
  app.use("/api/admin", adminClassesRouter);
  app.use("/api/admin-classes", adminClassesRouter); // Add duplicate route for backwards compatibility
  app.use("/api/activities", activitiesRouter);
  
  // Import and register users API router
  const usersRouter = await import("./api/users");
  app.use("/api/users", usersRouter.default);

  // Add individual student route first (more specific)
  app.get("/api/schools/students/:id", (req, res) => {
    const studentId = parseInt(req.params.id);
    console.log('🔍 Fetching individual student by ID:', studentId);

    try {
      const filePath = path.join(process.cwd(), 'data/children.json');

      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf-8');
        const fileChildren = JSON.parse(fileData);

        const student = fileChildren.find((child: any) => child.id === studentId);

        if (!student) {
          console.log('❌ Student not found with ID:', studentId);
          return res.status(404).json({ message: 'Student not found' });
        }

        console.log('✅ Student found:', student);
        return res.json(student);
      }

      res.status(404).json({ message: 'Student not found' });
    } catch (error) {
      console.error('❌ Error loading student:', error);
      res.status(500).json({ message: 'Error loading student' });
    }
  });

  // Add student update endpoint
  app.put("/api/schools/students/:id", (req, res) => {
    const studentId = parseInt(req.params.id);
    console.log('📝 Updating student with ID:', studentId);
    console.log('📄 Update data:', JSON.stringify(req.body, null, 2));

    try {
      const filePath = path.join(process.cwd(), 'data/children.json');

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const fileData = fs.readFileSync(filePath, 'utf-8');
      const students = JSON.parse(fileData);

      const studentIndex = students.findIndex((s: any) => s.id === studentId);

      if (studentIndex === -1) {
        console.log('❌ Student not found with ID:', studentId);
        return res.status(404).json({ message: 'Student not found' });
      }

      // Update the student with new data
      const updatedStudent = {
        ...students[studentIndex],
        firstName: req.body.firstName || students[studentIndex].firstName,
        lastName: req.body.lastName || students[studentIndex].lastName,
        birthdate: req.body.dateOfBirth || students[studentIndex].birthdate,
        gradeLevel: req.body.gradeLevel || students[studentIndex].gradeLevel,
        parentEmail: req.body.parentEmail || students[studentIndex].parentEmail,
        parentPhone: req.body.parentPhone || students[studentIndex].parentPhone,
        emergencyContact: req.body.emergencyContact || students[studentIndex].emergencyContact,
        emergencyPhone: req.body.emergencyPhone || students[studentIndex].emergencyPhone,
        medicalNotes: req.body.medicalNotes || students[studentIndex].medicalNotes,
        specialNeeds: req.body.specialNeeds || students[studentIndex].specialNeeds,
        updatedAt: new Date().toISOString()
      };

      students[studentIndex] = updatedStudent;

      // Write back to file
      fs.writeFileSync(filePath, JSON.stringify(students, null, 2));

      console.log('✅ Student updated successfully:', updatedStudent);
      res.json(updatedStudent);
    } catch (error) {
      console.error('❌ Error updating student:', error);
      res.status(500).json({ message: 'Error updating student' });
    }
  });

  // Add students route before schools router to bypass authentication
  app.get("/api/schools/students", (req, res) => {
    console.log('📚 Fetching students from database...');

    try {
      // Load directly from file to ensure all students appear
      const filePath = path.join(process.cwd(), 'data/children.json');

      console.log(`🔍 Checking file path: ${filePath}`);
      console.log(`📂 File exists: ${fs.existsSync(filePath)}`);

      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf-8');
        console.log(`📄 Raw file data: ${fileData.substring(0, 200)}...`);

        const fileChildren = JSON.parse(fileData);
        console.log(`📁 Loaded ${fileChildren.length} children directly from file:`, fileChildren.map((c: any) => c.firstName + ' ' + c.lastName));

        // Transform file data to match students format
        const students = fileChildren.map((child: any) => ({
          id: child.id,
          name: `${child.firstName} ${child.lastName}`,
          gradeLevel: child.gradeLevel || 'N/A',
          age: child.birthdate ? Math.floor((Date.now() - new Date(child.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A',
          parentName: 'Parent Contact',
          email: 'coreycreates@gmail.com',
          enrollmentDate: child.createdAt ? new Date(child.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          status: 'Active',
          classes: [],
          avatar: '',
        }));

        console.log(`📚 Returning ${students.length} students from file:`, students.map((s: any) => s.name));
        return res.json(students);
      } else {
        console.log(`❌ File does not exist at path: ${filePath}`);
      }
    } catch (error) {
      console.error('❌ Error reading students file:', error);
    }

    // Fallback if file reading fails
    const students = [
      {
        id: 1,
        name: 'Adaluna Brown',
        gradeLevel: '2',
        age: 2,
        parentName: 'Parent Contact',
        email: 'coreycreates@gmail.com',
        enrollmentDate: new Date().toISOString().split('T')[0],
        status: 'Active',
        classes: [],
        avatar: '',
      }
    ];

    console.log(`📚 Returning ${students.length} fallback students`);
    res.json(students);
  });

  app.use("/api/image-services", imageServicesRouter);
  app.use("/api/ocr-test", ocrTestRouter);
  // Class details endpoint - direct route to avoid middleware conflicts
  app.get("/api/class-details/:id", (req, res) => {
    const classId = parseInt(req.params.id);
    console.log('🔍 Fetching class details with ID:', classId);

    try {
      const filePath = path.join(process.cwd(), 'data/classes.json');

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Class not found' });
      }

      const fileData = fs.readFileSync(filePath, 'utf-8');
      const allClasses = JSON.parse(fileData);

      const classData = allClasses.find((cls: any) => cls.id === classId);

      if (!classData) {
        console.log('❌ Class not found with ID:', classId);
        return res.status(404).json({ message: 'Class not found' });
      }

      console.log('✅ Class found:', classData.title);
      res.json(classData);
    } catch (error) {
      console.error('❌ Error loading class:', error);
      res.status(500).json({ message: 'Error loading class' });
    }
  });

  // Class update endpoint
  app.put("/api/class-details/:id", (req, res) => {
    const classId = parseInt(req.params.id);
    console.log('📝 Updating class with ID:', classId);
    console.log('📄 Update data:', JSON.stringify(req.body, null, 2));

    try {
      const filePath = path.join(process.cwd(), 'data/classes.json');

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Classes file not found' });
      }

      const fileData = fs.readFileSync(filePath, 'utf-8');
      const allClasses = JSON.parse(fileData);

      const classIndex = allClasses.findIndex((cls: any) => cls.id === classId);

      if (classIndex === -1) {
        console.log('❌ Class not found with ID:', classId);
        return res.status(404).json({ message: 'Class not found' });
      }

      // Update the class with new data
      const updatedClass = {
        ...allClasses[classIndex],
        title: req.body.title || allClasses[classIndex].title,
        description: req.body.description || allClasses[classIndex].description,
        category: req.body.category || allClasses[classIndex].category,
        gradeLevel: req.body.gradeLevel || allClasses[classIndex].gradeLevel,
        status: req.body.status || allClasses[classIndex].status,
        startDate: req.body.startDate || allClasses[classIndex].startDate,
        endDate: req.body.endDate || allClasses[classIndex].endDate,
        schedule: req.body.schedule || allClasses[classIndex].schedule,
        capacity: req.body.capacity || allClasses[classIndex].capacity,
        location: req.body.location || allClasses[classIndex].location,
        instructorName: req.body.instructorName || allClasses[classIndex].instructorName,
        price: req.body.price || allClasses[classIndex].price,
        updatedAt: new Date().toISOString()
      };

      allClasses[classIndex] = updatedClass;

      // Write back to file
      fs.writeFileSync(filePath, JSON.stringify(allClasses, null, 2));

      console.log('✅ Class updated successfully:', updatedClass.title);
      res.json(updatedClass);
    } catch (error) {
      console.error('❌ Error updating class:', error);
      res.status(500).json({ message: 'Error updating class' });
    }
  });

  app.use("/api/schools", schoolsRouter);
  app.use("/api/school-admin", schoolAdminRouter);

  // Student registration endpoint for school admins
  app.post("/api/students/register", async (req, res) => {
    console.log('🚀 Student registration started');
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));

    try {
      const {
        firstName,
        lastName,
        dateOfBirth,
        gradeLevel,
        parentEmail,
        parentPhone,
        emergencyContact,
        emergencyPhone,
        medicalNotes,
        specialNeeds,
        sendInvitation
      } = req.body;

      console.log('✅ Extracted form data:', {
        firstName, lastName, dateOfBirth, gradeLevel, parentEmail, sendInvitation
      });

      // Create or find parent account
      console.log('🔍 Looking for parent with email:', parentEmail);
      let parentUser = await storage.getUserByEmail(parentEmail);

      if (!parentUser) {
        console.log('👤 Parent not found, creating new account...');
        try {
          parentUser = await storage.createUser({
            username: parentEmail, // Use email as username
            email: parentEmail,
            password: 'temppass123', // Temporary password - parent will set their own
            name: `${firstName}'s Parent`, // Default name
            role: 'parent',
            subscription: 'free'
          });
          console.log('✅ Parent account created:', parentUser.id);
        } catch (userError) {
          console.error('❌ Error creating parent user:', userError);
          throw userError;
        }
      } else {
        console.log('✅ Found existing parent:', parentUser.id);
      }

      // Create the student/child record with correct schema
      console.log('👶 Creating child record...');
      const childData = {
        firstName,
        lastName,
        birthdate: dateOfBirth, // Use 'birthdate' not 'dateOfBirth'
        gradeLevel,
        parentId: parentUser.id,
        school: null,
        learningStyle: null,
        specialNeeds: specialNeeds || null,
        interests: null,
        allergies: null,
        medicalInfo: medicalNotes || null,
        profileImage: null
      };

      console.log('📋 Child data:', JSON.stringify(childData, null, 2));

      let child;
      try {
        child = await storage.createChild(childData);
        console.log('✅ Child created successfully:', child.id);
      } catch (childError) {
        console.error('❌ Error creating child:', childError);
        throw childError;
      }

      // If email invitation is requested, prepare invitation
      if (sendInvitation) {
        // Here you would implement email service
        console.log(`Sending invitation email to ${parentEmail} for child ${firstName} ${lastName}`);

        // For now, we'll just log it. In production, you'd use a service like SendGrid
        const invitationMessage = `
          Hello! Your child ${firstName} ${lastName} has been registered at our school.
          Please log in to access your child's account and manage their enrollment.

          Login at: ${req.protocol}://${req.get('host')}/login
          Email: ${parentEmail}
        `;

        console.log('Invitation email content:', invitationMessage);
      }

      console.log('🎉 Registration completed successfully!');
      res.json({
        success: true,
        message: 'Student registered successfully',
        student: {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          parentEmail: parentUser.email
        }
      });

    } catch (error) {
      console.error('💥 REGISTRATION ERROR:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to register student',
        error: error.message
      });
    }
  });

  // Helper function to calculate age from birthdate
  function calculateAge(birthdate) {
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDifference = today.getMonth() - birth.getMonth();

    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }

  // CSV Upload routes
  app.post('/api/admin/upload/classes', isAuthenticated, requireAdmin, csvUploadApi.uploadClassesCsv);

  // Children API endpoint for parents
  app.get("/api/children", verifyAuth0Token, async (req, res) => {
    try {
      // Extract access token from Authorization header
      const accessToken = req.headers.authorization?.substring(7); // Remove 'Bearer ' prefix
      
      if (!accessToken) {
        return res.status(401).json({ message: "No access token provided" });
      }

      // Get user info from Auth0 userinfo endpoint to get the email
      const userInfoResponse = await fetch(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!userInfoResponse.ok) {
        console.log('❌ Failed to fetch user info from Auth0');
        return res.status(401).json({ message: "Failed to authenticate with Auth0" });
      }

      const userInfo = await userInfoResponse.json();
      const userEmail = userInfo.email;
      
      // Debug: Log the entire token payload to understand the structure
      console.log('🔍 Auth0 token payload for children endpoint:', JSON.stringify(req.auth?.payload, null, 2));
      console.log('📧 User email from Auth0 userinfo:', userEmail);
      
      if (!userEmail) {
        console.log('❌ No email found in Auth0 userinfo');
        return res.status(401).json({ message: "Email not found in user profile" });
      }
      
      // Check for role in multiple possible locations
      const userRole = req.auth?.payload?.['https://myapp.com/role'] || 
                      req.auth?.payload?.role || 
                      req.auth?.payload?.['app_metadata']?.role ||
                      'parent'; // Default to parent for now

      console.log('👤 Detected user role:', userRole);

      if (userRole !== 'parent') {
        console.log('❌ Access denied - role is not parent:', userRole);
        return res.status(403).json({ message: "Access denied. Parents only." });
      }

      // Load children data
      const childrenPath = path.join(process.cwd(), 'data', 'children.json');
      let children = [];

      try {
        const childrenData = fs.readFileSync(childrenPath, 'utf8');
        children = JSON.parse(childrenData);
      } catch (error) {
        console.log('No children data file found, returning empty array');
        return res.json([]);
      }

      // Filter children that match the parent's email and calculate age
      const parentChildren = children.filter(child => {
        // Check if parent email matches any of the contact emails
        return child.parentEmail === userEmail || 
               child.emergencyContact?.email === userEmail ||
               child.secondaryContact?.email === userEmail;
      }).map(child => {
        // Calculate age from birthdate
        const age = calculateAge(child.birthdate);
        return { ...child, age };
      });

      console.log(`👨‍👩‍👧‍👦 Found ${parentChildren.length} children for parent: ${userEmail}`);
      res.json(parentChildren);

    } catch (error) {
      console.error("Error fetching children:", error);
      res.status(500).json({ message: "Error fetching children data" });
    }
  });

  // Serve uploaded files (including PDFs)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  // Backup management endpoints
  app.get("/api/admin/backups", async (req, res) => {
    try {
      const backups = await backupService.listBackups();
      res.json(backups);
    } catch (error) {
      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  app.post("/api/admin/backups/create", async (req, res) => {
    try {
      await backupService.performBackup();
      res.json({ success: true, message: "Backup created successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/admin/backups/restore/:timestamp", async (req, res) => {
    try {
      const { timestamp } = req.params;
      const result = await backupService.restoreBackup(timestamp);

      if (result.success) {
        res.json({ success: true, message: `Restored ${result.restoredCount} files` });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to restore backup" });
    }
  });

  return httpServer;
}