import express, { type Express, type Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerTechnicalSupportRoutes } from "./api/technical-support.js";
import { nlpService } from "./nlp-service";
import bcrypt from "bcryptjs";
import session from "express-session";
import { z } from "zod";
import { insertUserSchema, insertCurriculumSchema, insertLessonSchema, insertEventSchema, insertMarketplaceItemSchema, insertKnowledgeBaseSchema, insertChildSchema, insertEmergencyContactSchema, insertProgramSchema, insertProgramEnrollmentSchema } from "@shared/schema";
import { supabaseAuth } from "./middleware/supabase-auth";

// Type for authenticated requests with our auth structure
interface AuthenticatedRequest extends Request {
  user?: any;
  session?: any;
}
// Removed session-based children router - using Auth0 endpoints instead
import * as emergencyContactsApi from "./api/emergency-contacts";
import * as programsApi from "./api/programs";
import * as programEnrollmentsApi from "./api/program-enrollments";
import * as csvUploadApi from "./api/csv-upload";
import aiPricingRouter from "./api/ai-pricing";
import adminClassesRouter from "./api/admin-classes";
import adminRouter from "./api/admin";
import { backupService } from "./services/backupService";
import classesRouter from "./api/classes";
import activitiesRouter from "./api/activities";
import imageServicesRouter from "./api/image-services";
import ocrTestRouter from "./api/ocr-test";
import schoolsRouter from "./api/schools";
import schoolAdminRouter from "./api/school-admin";
import educatorRouter from "./api/educator";
import roleInvitationsRouter from "./api/role-invitations";
import parentRouter from "./api/parent";
import { handleEnrollmentMessage } from "./api/enrollment-assistant";
import migrationRouter from "./routes/migration";
import marketingLinksRouter from "./api/marketing-links";
import aiInsightsRouter from "./api/ai-insights";
import parentProfileRouter from "./api/parent-profile";
import accountImportRouter from "./api/account-import";
import paymentCleanupRouter from "./api/payment-cleanup";
import { uploadKnowledgeBaseFiles, getProcessingStatus, getProcessingStats } from "./api/knowledge-base-upload";
import customFormsRouter from "./api/custom-forms";
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import stream from 'stream';
import { promisify } from 'util';
import Stripe from "stripe";

// For historical and test users (keep these for test compatibility)
const testUsers = {
  admin: {
    id: 1,
    name: "Admin User",
    email: "admin@example.com",
    role: "admin",
    avatar: null,
    subscription: "premium"
  },
  educator: {
    id: 2,
    name: "Educator User",
    email: "educator@example.com",
    role: "educator",
    avatar: null,
    subscription: "educator"
  },
  parent: {
    id: 3,
    name: "Parent User",
    email: "parent@example.com",
    role: "parent",
    avatar: null,
    subscription: "family"
  },
  learner: {
    id: 4,
    name: "Learner User",
    email: "learner@example.com",
    role: "student",
    avatar: null,
    subscription: "free"
  }
};

// Helper functions for school boundary validation
function extractSchoolId(req: any): number | null {
  const schoolIdFromToken = req.auth?.payload?.school_id;
  if (!schoolIdFromToken) {
    return null;
  }
  const schoolId = parseInt(schoolIdFromToken, 10);
  return isNaN(schoolId) ? null : schoolId;
}

function requireSchoolContext(req: any, res: any): number | null {
  const schoolId = extractSchoolId(req);
  if (schoolId === null) {
    res.status(400).json({ message: "School ID not found or invalid in user metadata" });
    return null;
  }
  return schoolId;
}

// Removed express-session declarations - using Auth0 token-based authentication

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize database tables
  const { initializeDatabase } = await import('./init-db');
  await initializeDatabase();

  // Import Supabase authentication middleware
  const { supabaseAuth } = await import("./middleware/supabase-auth");
  
  // Create alias for compatibility with existing code
  const jwtCheck = supabaseAuth;
  const isAuthenticated = supabaseAuth;
  
  // Import role-based middleware (keeping for compatibility)
  const { requireRole, requireAdmin, requireEducator } = await import("./middleware/auth0-auth");

  // Role switching API endpoint for multi-role users
  app.post("/api/switch-role", jwtCheck, async (req, res) => {
    try {
      const { targetRole } = req.body;
      const userEmail = req.auth?.payload?.email;

      if (!userEmail) {
        return res.status(401).json({ message: "User email not found in token" });
      }

      // Only allow role switching for specific multi-role users
      const multiRoleUsers = ['coreycreates@gmail.com'];
      if (!multiRoleUsers.includes(userEmail)) {
        return res.status(403).json({ message: "Role switching not allowed for this user" });
      }

      // Validate target role
      const allowedRoles = ['parent', 'schoolAdmin'];
      if (!allowedRoles.includes(targetRole)) {
        return res.status(400).json({ message: "Invalid target role" });
      }

      // Store the active role in session/context for this user
      // For now, we'll return success and let the frontend handle the role context
      res.status(200).json({ 
        message: "Role switched successfully",
        activeRole: targetRole,
        userEmail 
      });
    } catch (error) {
      console.error("Role switch error:", error);
      res.status(500).json({ message: "Error switching role" });
    }
  });

  // Register API routers
  // Children endpoint is now handled directly below with Auth0 authentication

  // Parent-Child sync endpoint
  app.post("/api/sync-children", jwtCheck, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/auth/sync", jwtCheck, async (req: AuthenticatedRequest, res) => {
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

  // Aliases already defined at top of registerRoutes function

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
      console.log('📝 Registration request body:', JSON.stringify(req.body, null, 2));
      
      const validatedData = insertUserSchema.parse(req.body);
      console.log('✅ Data validation passed:', validatedData);

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        console.log('❌ Username already exists:', validatedData.username);
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        console.log('❌ Email already exists:', validatedData.email);
        return res.status(400).json({ message: "Email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      console.log('🔒 Password hashed successfully');

      // Create user in local storage first
      console.log('👤 Creating user with data:', { ...validatedData, password: '[REDACTED]' });
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword
      });
      console.log('✅ User created successfully in local storage:', user.id);

      // Remove password from response first
      const { password, ...userWithoutPassword } = user;

      // Also create user in Supabase for authentication
      console.log('🔄 Attempting to create user in Supabase...');
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        console.log('🔑 Supabase URL available:', !!supabaseUrl);
        console.log('🔑 Service key available:', !!supabaseServiceKey);
        
        if (supabaseUrl && supabaseServiceKey) {
          console.log('🔧 Creating Supabase admin client...');
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
          
          console.log('👤 Creating user in Supabase auth system...');
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: validatedData.email,
            password: validatedData.password,
            email_confirm: true,
            user_metadata: {
              role: validatedData.role,
              name: validatedData.name,
              school_id: validatedData.schoolId  // Use snake_case to match API expectations
            }
          });

          if (authError) {
            console.log('⚠️ Supabase user creation failed, but local user created:', authError.message);
          } else {
            console.log('✅ User also created in Supabase:', authUser?.user?.id);
          }
        } else {
          console.log('⚠️ Supabase credentials not available, user only created locally');
        }
      } catch (supabaseError) {
        console.log('⚠️ Error creating user in Supabase:', supabaseError instanceof Error ? supabaseError.message : 'Unknown error');
      }

      res.status(201).json({ message: "User created successfully", user: userWithoutPassword });
    } catch (error) {
      console.error('❌ Registration error:', error);
      if (error instanceof z.ZodError) {
        console.error('📋 Validation errors:', error.errors);
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error('💥 Unknown error during registration:', error);
      res.status(500).json({ 
        message: "Error creating user",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Auth0 token verification endpoint - replaces traditional login
  app.get("/api/auth/verify", jwtCheck, async (req: any, res) => {
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
      const authData = (req as any).auth;
      const userId = authData?.userId || 'dev-user';
      console.log("AI Curriculum Generation - Request received", { userId });
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
        curriculumData = curriculumTemplateToDbFormat(curriculumTemplate, userId);

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
              userId,
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

  app.get("/api/events/upcoming", jwtCheck, async (req: any, res) => {
    try {
      // Get email from Supabase auth structure
      const userEmail = req.auth?.email;

      console.log('🎪 Events API - Supabase auth object:', JSON.stringify(req.auth, null, 2));
      console.log('🎪 Events API - Extracted email:', userEmail);

      if (!userEmail) {
        console.log('❌ Events API - No email found in token');
        return res.status(401).json({ message: "Not authenticated" });
      }

      // For now, return empty array since we don't have user-specific events implemented
      // This prevents the 500 error and allows the parent dashboard to load
      const events: any[] = [];
      res.status(200).json(events);
    } catch (error) {
      console.error('❌ Events API error:', error);
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

  // GET individual knowledge base by ID (public access)
  app.get("/api/knowledge-bases/:id", async (req, res) => {
    try {
      const knowledgeBaseId = parseInt(req.params.id);

      if (isNaN(knowledgeBaseId)) {
        return res.status(400).json({ message: "Invalid knowledge base ID" });
      }

      let knowledgeBase;

      try {
        knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);
      } catch (dbError) {
        console.error("Database error fetching knowledge base, falling back to file storage:", dbError);

        // Fallback to file storage
        try {
          const fs = require('fs');
          const path = require('path');
          const kbFilePath = path.join(process.cwd(), 'data', 'knowledge-bases.json');

          if (fs.existsSync(kbFilePath)) {
            const fileContent = fs.readFileSync(kbFilePath, 'utf-8');
            const allKnowledgeBases = JSON.parse(fileContent);
            knowledgeBase = allKnowledgeBases.find((kb: any) => kb.id === knowledgeBaseId);
            console.log(`✅ Loaded knowledge base ${knowledgeBaseId} from file storage`);
          } else {
            console.log('⚠️ No knowledge-bases.json file found');
          }
        } catch (fileError) {
          console.error("File storage also failed:", fileError);
          return res.status(500).json({ message: "Error accessing knowledge base data" });
        }
      }

      if (!knowledgeBase) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      res.status(200).json(knowledgeBase);
    } catch (error) {
      console.error("Error fetching knowledge base:", error);
      res.status(500).json({ message: "Error fetching knowledge base" });
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
        const authData = (req as any).auth;
        if (authData?.userId) {
          userKnowledgeBases = await storage.getKnowledgeBasesByAuthor(authData.userId);
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

  app.get("/api/knowledge-bases/:id", isAuthenticated, async (req, res) => {
    try {
      const knowledgeBaseId = parseInt(req.params.id);
      const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);

      if (!knowledgeBase) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      // Check if knowledge base is public or user is authenticated and is the author
      const authData = (req as any).auth;
      const isAuthor = authData?.userId && String(knowledgeBase.authorId) === String(authData.userId);
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
      const authData = (req as any).auth;
      console.log("Received knowledge base creation request from:", authData?.userId);
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("Auth:", JSON.stringify(authData, null, 2));

      // Check if user ID is available in auth
      if (!authData?.userId) {
        console.log("User not authenticated in auth");
        return res.status(401).json({ message: "User not authenticated" });
      }

      try {
        console.log("Attempting to validate data with schema");
        console.log("Schema expects:", Object.keys(insertKnowledgeBaseSchema.shape).join(", "));
        console.log("Received fields:", Object.keys(req.body).join(", "));

        const validatedData = insertKnowledgeBaseSchema.parse(req.body);
        console.log("Validation passed, creating knowledge base with data:", JSON.stringify(validatedData, null, 2));

        try {
          const knowledgeBase = await storage.createKnowledgeBase({
            ...validatedData,
            authorId: authData.userId
          });

          console.log("Knowledge base created with ID:", knowledgeBase.id);
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
              authorId: authData.userId,
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
      const authData = (req as any).auth;
      if (knowledgeBase.authorId !== authData?.userId) {
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
    new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' }) : 
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
  app.get('/api/program-enrollments', jwtCheck, programEnrollmentsApi.getMyChildrenEnrollments);
  app.get('/api/programs/:programId/enrollments', isAuthenticated, requireEducator, programEnrollmentsApi.getProgramEnrollments);
  app.get('/api/program-enrollments/:id', isAuthenticated, programEnrollmentsApi.getEnrollmentById);
  app.post('/api/program-enrollments', isAuthenticated, programEnrollmentsApi.createEnrollment);
  app.put('/api/program-enrollments/:id', isAuthenticated, programEnrollmentsApi.updateEnrollment);
  app.delete('/api/program-enrollments/:id', isAuthenticated, requireAdmin, programEnrollmentsApi.deleteEnrollment);

  // Manual membership enrollment creation for school admins
  app.post('/api/admin/membership-enrollments', jwtCheck, requireRole(['schoolAdmin', 'superAdmin', 'admin']), async (req, res) => {
    try {
      const { parentUserId, schoolId, membershipYear } = req.body;
      
      if (!parentUserId || !schoolId) {
        return res.status(400).json({ message: 'Parent ID and School ID are required' });
      }
      
      // Get the school to fetch membership settings
      const school = await storage.getSchool(schoolId);
      if (!school) {
        return res.status(404).json({ message: 'School not found' });
      }
      
      if (!school.membershipFeeAmount || school.membershipFeeAmount <= 0) {
        return res.status(400).json({ message: 'School does not have membership fees configured' });
      }
      
      // Use current year if not provided
      const currentYear = membershipYear || new Date().getFullYear();
      
      // Check if membership already exists for this parent, school, and year
      const existingMembership = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId, schoolId, currentYear);
      if (existingMembership) {
        return res.status(400).json({ message: 'Membership already exists for this year' });
      }
      
      // Create the membership enrollment
      const membershipData = {
        parentUserId,
        schoolId,
        membershipYear: currentYear,
        amount: school.membershipFeeAmount,
        status: 'pending_payment' as const,
        dueDate: school.membershipRenewalDate || new Date(currentYear, 8, 1), // September 1st default
        expirationDate: new Date(currentYear + 1, 7, 31), // August 31st of next year
        gracePeriodEnd: new Date(currentYear, 8, 30), // September 30th
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const membership = await storage.createMembershipEnrollment(membershipData);
      
      res.status(201).json(membership);
    } catch (error: any) {
      console.error('Error creating membership enrollment:', error);
      res.status(500).json({ message: 'Failed to create membership enrollment', error: error.message });
    }
  });

  // AI Enrollment Assistant with Anthropic AI
  app.post('/api/ai/enrollment-assistant', jwtCheck, handleEnrollmentMessage);

  // SuperAdmin routes
  const { getSuperAdminSchools, getSuperAdminSchoolDetails, updateSuperAdminSchool } = await import('./api/superadmin-schools');
  app.get('/api/superadmin/schools', jwtCheck, requireRole(['superAdmin']), getSuperAdminSchools);
  app.get('/api/superadmin/schools/:schoolId', jwtCheck, requireRole(['superAdmin']), getSuperAdminSchoolDetails);
  app.patch('/api/superadmin/schools/:schoolId', jwtCheck, requireRole(['superAdmin']), updateSuperAdminSchool);

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
  app.use("/api/ai-insights", aiInsightsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin-classes", adminClassesRouter); // Add duplicate route for backwards compatibility
  app.use("/api/activities", activitiesRouter);
  app.use("/api/migration", migrationRouter);
  app.use("/api/school-admin/marketing-links", marketingLinksRouter);
  app.use("/api/account-import", accountImportRouter);
  app.use("/api/payment-cleanup", paymentCleanupRouter);

  // Import and register enrollments API router
  const enrollmentsRouter = await import("./api/enrollments");
  app.use("/api/enrollments", enrollmentsRouter.default);

  // Add children enrollments endpoint
  app.get("/api/children/:id/enrollments", async (req, res) => {
    try {
      const childId = parseInt(req.params.id);

      if (isNaN(childId)) {
        return res.status(400).json({ message: 'Invalid child ID' });
      }

      console.log(`📚 Fetching enrollments for child ID: ${childId}`);

      // Get enrollments for this child
      const enrollments = await storage.getEnrollmentsByChildId(childId);

      console.log(`📚 Found ${enrollments.length} enrollments for child ${childId}:`, enrollments);

      res.json(enrollments);
    } catch (error) {
      console.error('Error fetching child enrollments:', error);
      res.status(500).json({ message: 'Failed to fetch enrollments' });
    }
  });

  // Family schedule endpoint
  app.get("/api/schedule", jwtCheck, async (req, res) => {
    try {
      const userEmail = req.auth?.payload?.email;

      if (!userEmail) {
        return res.status(401).json({ message: 'User email not found in token' });
      }

      console.log(`📅 Fetching schedule for parent: ${userEmail}`);

      // Get query parameters for filtering
      const childIdFilter = req.query.childId as string;
      const typeFilter = req.query.type as string;

      // Get all children for this parent
      const children = await storage.getChildrenByParentEmail(userEmail);
      console.log(`👨‍👩‍👧‍👦 Found ${children.length} children for parent`);

      if (children.length === 0) {
        return res.json([]);
      }

      // Get enrollments for all children (or filtered child)
      let allEnrollments: any[] = [];
      
      if (childIdFilter && childIdFilter !== 'all') {
        const childId = parseInt(childIdFilter);
        const enrollments = await storage.getEnrollmentsByChildId(childId);
        allEnrollments = enrollments.map((e: any) => ({
          ...e,
          childId,
          childName: children.find(c => c.id === childId)?.firstName + ' ' + children.find(c => c.id === childId)?.lastName
        }));
      } else {
        // Get enrollments for all children
        for (const child of children) {
          const enrollments = await storage.getEnrollmentsByChildId(child.id);
          allEnrollments.push(...enrollments.map((e: any) => ({
            ...e,
            childId: child.id,
            childName: `${child.firstName} ${child.lastName}`
          })));
        }
      }

      console.log(`📋 Found ${allEnrollments.length} total enrollments`);

      // Filter to only enrolled status
      const activeEnrollments = allEnrollments.filter(e => e.status === 'enrolled');
      console.log(`✅ ${activeEnrollments.length} active enrollments`);

      // Get class details for each enrollment and format as schedule events
      const scheduleEvents = await Promise.all(
        activeEnrollments.map(async (enrollment) => {
          // Get class details
          const classId = enrollment.classId || enrollment.programId;
          const classDetails = await storage.getClassById(classId);
          
          if (!classDetails) {
            console.log(`⚠️ Class not found for enrollment:`, enrollment);
            return null;
          }

          // Parse schedule to get days and times (format: "Monday, Wednesday, Friday 9am-12pm")
          const scheduleMatch = classDetails.schedule?.match(/(\d+)(am|pm)-(\d+)(am|pm)/);
          let startTime = '9:00';
          let endTime = '12:00';
          
          if (scheduleMatch) {
            const startHour = parseInt(scheduleMatch[1]);
            const startPeriod = scheduleMatch[2];
            const endHour = parseInt(scheduleMatch[3]);
            const endPeriod = scheduleMatch[4];
            
            startTime = `${startPeriod === 'pm' && startHour !== 12 ? startHour + 12 : startHour}:00`;
            endTime = `${endPeriod === 'pm' && endHour !== 12 ? endHour + 12 : endHour}:00`;
          }

          // Parse days of week from schedule
          const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const scheduleDays: number[] = [];
          
          daysOfWeek.forEach((day, index) => {
            if (classDetails.schedule?.toLowerCase().includes(day.toLowerCase())) {
              scheduleDays.push(index);
            }
          });

          // Generate recurring events for the next 3 months
          const events: any[] = [];
          const startDateObj = new Date(classDetails.startDate || new Date());
          const endDateObj = new Date(classDetails.endDate || new Date());
          endDateObj.setMonth(endDateObj.getMonth() + 3); // Show 3 months ahead
          
          const currentDate = new Date(startDateObj);
          
          while (currentDate <= endDateObj) {
            if (scheduleDays.includes(currentDate.getDay())) {
              events.push({
                id: `enrollment-${enrollment.id || Math.random()}-${classDetails.id}-${currentDate.toISOString()}`,
                title: classDetails.title || enrollment.className,
                date: currentDate.toISOString().split('T')[0],
                startTime,
                endTime,
                location: classDetails.location || 'Location TBD',
                type: 'class',
                childId: enrollment.childId.toString(),
                childName: enrollment.childName,
                color: '#3b82f6',
                description: classDetails.description || '',
                programName: classDetails.title,
                instructorName: classDetails.instructorName || 'TBD',
                schedule: classDetails.schedule
              });
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }

          return events;
        })
      );

      // Flatten array of arrays (each enrollment returns multiple events)
      // and filter out null values
      let validEvents = scheduleEvents.flat().filter(Boolean);
      
      if (typeFilter && typeFilter !== 'all') {
        validEvents = validEvents.filter(e => e.type === typeFilter);
      }

      console.log(`📅 Returning ${validEvents.length} schedule events`);
      res.json(validEvents);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      res.status(500).json({ message: 'Failed to fetch schedule' });
    }
  });

  // Add individual child endpoint
  app.get("/api/children/:id", async (req, res) => {
    try {
      const childId = parseInt(req.params.id);

      if (isNaN(childId)) {
        return res.status(400).json({ message: 'Invalid child ID' });
      }

      console.log(`👶 Fetching child data for ID: ${childId}`);

      // Get child data
      const child = await storage.getChildById(childId);

      if (!child) {
        console.log(`❌ Child not found with ID: ${childId}`);
        return res.status(404).json({ message: 'Child not found' });
      }

      console.log(`✅ Child found:`, child.firstName, child.lastName);
      res.json(child);
    } catch (error) {
      console.error('Error fetching child:', error);
      res.status(500).json({ message: 'Failed to fetch child data' });
    }
  });

  // Update child endpoint
  app.patch("/api/children/:id", jwtCheck, async (req, res) => {
    try {
      const childId = parseInt(req.params.id);
      const updateData = req.body;

      if (isNaN(childId)) {
        return res.status(400).json({ message: 'Invalid child ID' });
      }

      console.log(`📝 Updating child ${childId} with data:`, JSON.stringify(updateData, null, 2));

      // Verify the user is authenticated
      if (!req.user || !req.user.email) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // For JWT authentication, we trust the token verification
      // The middleware already validated the user's access
      console.log(`🔐 Authenticated user attempting update: ${req.user.email}`);

      // Check if the child belongs to this parent
      const existingChild = await storage.getChildById(childId);
      if (!existingChild) {
        return res.status(404).json({ message: "Child not found" });
      }

      if (existingChild.parentEmail !== req.user.email) {
        console.log(`❌ Access denied - child belongs to different parent`);
        return res.status(403).json({ message: "You can only update your own children" });
      }

      // Update the child using the storage system
      const updatedChild = await storage.updateChild(childId, updateData);

      if (!updatedChild) {
        return res.status(404).json({ message: "Child not found" });
      }

      console.log(`✅ Child ${childId} updated successfully:`, updatedChild.firstName, updatedChild.lastName);

      return res.status(200).json({
        message: "Child updated successfully",
        id: childId,
        child: updatedChild
      });
    } catch (error) {
      console.error("Error updating child:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Import and register users API router
  const usersRouter = await import("./api/users");
  app.use("/api/users", usersRouter.default);

  // Add endpoint to get user role by email for authentication
  app.get("/api/users/role/:email", async (req, res) => {
    try {
      const email = req.params.email;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ role: user.role, email: user.email });
    } catch (error) {
      console.error("Error fetching user role:", error);
      res.status(500).json({ message: "Error fetching user role" });
    }
  });

  // Add individual student route first (more specific)
  app.get("/api/schools/students/:id", (req, res) => {
    const requestedId = parseInt(req.params.id);
    console.log('🔍 Fetching individual student by ID:', requestedId);

    try {
      // Load both children and school-students data
      const childrenPath = path.join(process.cwd(), 'data/children.json');
      const schoolStudentsPath = path.join(process.cwd(), 'data/school-students.json');
      
      if (!fs.existsSync(childrenPath)) {
        console.log('❌ Children data file not found');
        return res.status(404).json({ message: 'Student data not available' });
      }

      const childrenData = fs.readFileSync(childrenPath, 'utf-8');
      const children = JSON.parse(childrenData);

      let targetChildId = requestedId;

      // Check if the requested ID is a school student ID
      if (fs.existsSync(schoolStudentsPath)) {
        const schoolStudentsData = fs.readFileSync(schoolStudentsPath, 'utf-8');
        const schoolStudents = JSON.parse(schoolStudentsData);
        
        const schoolStudent = schoolStudents.find((ss: any) => ss.id === requestedId);
        if (schoolStudent) {
          targetChildId = schoolStudent.childId;
          console.log('🔗 Mapped school student ID', requestedId, 'to child ID', targetChildId);
        }
      }

      // Find the child by ID
      const student = children.find((child: any) => child.id === targetChildId);

      if (!student) {
        console.log('❌ Student not found with child ID:', targetChildId);
        return res.status(404).json({ message: 'Student not found' });
      }

      console.log('✅ Student found:', {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        parentEmail: student.parentEmail
      });
      return res.json(student);
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
        updatedAt: new Date().toISOString()      };

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

  // User settings endpoints
  app.get("/api/users/profile", jwtCheck, async (req, res) => {
    try {
      const userId = req.auth?.payload?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get schoolId from JWT token metadata
      const schoolIdFromToken = req.auth?.payload?.school_id;
      const schoolId = schoolIdFromToken ? Number(schoolIdFromToken) : null;

      console.log('👤 Profile request - userId:', userId, 'schoolId:', schoolId);

      // Return basic user profile information including schoolId
      res.json({
        id: userId,
        email: req.auth?.payload?.email || '',
        firstName: req.auth?.payload?.given_name || '',
        lastName: req.auth?.payload?.family_name || '',
        username: req.auth?.payload?.email || '',
        phoneNumber: req.auth?.payload?.phone_number || '',
        role: req.auth?.payload?.role || 'staff',
        schoolId: schoolId && !isNaN(schoolId) ? schoolId : null
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Error fetching user profile" });
    }
  });

  app.patch("/api/users/profile", jwtCheck, async (req, res) => {
    try {
      const userId = req.auth?.payload?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { firstName, lastName, phoneNumber, username } = req.body;

      // In a real implementation, you would update the user in your database
      // For now, we'll just return a success response
      res.json({
        message: "Profile updated successfully",
        profile: {
          firstName,
          lastName,
          phoneNumber,
          username
        }
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Error updating user profile" });
    }
  });

  app.get("/api/users/notifications", jwtCheck, async (req, res) => {
    try {
      const userId = req.auth?.payload?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Return default notification settings
      res.json({
        emailNotifications: true,
        smsNotifications: false,
        enrollmentAlerts: true,
        paymentReminders: true,
        staffUpdates: true,
        systemMaintenance: false
      });
    } catch (error) {
      console.error("Error fetching notification settings:", error);
      res.status(500).json({ message: "Error fetching notification settings" });
    }
  });

  app.patch("/api/users/notifications", jwtCheck, async (req, res) => {
    try {
      const userId = req.auth?.payload?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const notificationSettings = req.body;

      // In a real implementation, you would save these settings to your database
      res.json({
        message: "Notification settings updated successfully",
        settings: notificationSettings
      });
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ message: "Error updating notification settings" });
    }
  });

  app.post("/api/users/change-password", jwtCheck, async (req, res) => {
    try {
      const userId = req.auth?.payload?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters long" });
      }

      // In a real implementation, you would verify the current password and update it
      // For now, we'll just return a success response
      res.json({
        message: "Password changed successfully"
      });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Error changing password" });
    }
  });

  app.use("/api/image-services", imageServicesRouter);
  app.use("/api/ocr-test", ocrTestRouter);
  // Class details endpoint - direct route to avoid middleware conflicts
  app.get("/api/class-details/:id", async (req, res) => {
    const classId = parseInt(req.params.id);
    console.log('🔍 Fetching class details with ID:', classId);

    try {
      if (isNaN(classId)) {
        return res.status(400).json({ message: 'Invalid class ID' });
      }

      // Fetch class from database
      const classData = await storage.getClassById(classId);

      if (!classData) {
        console.log('❌ Class not found with ID:', classId);
        return res.status(404).json({ message: 'Class not found' });
      }

      // Parse variants from schedule field if they exist
      let enhancedClassData = { ...classData };
      if (classData.schedule && typeof classData.schedule === 'string') {
        try {
          const scheduleData = JSON.parse(classData.schedule);
          if (scheduleData && scheduleData.variants && Array.isArray(scheduleData.variants)) {
            console.log('✅ Parsed variants from schedule field:', scheduleData.variants);
            enhancedClassData.variants = scheduleData.variants;
          }
        } catch (e) {
          // Not JSON, keep schedule as-is
          console.log('📝 Schedule is not JSON, keeping as string');
        }
      }

      console.log('✅ Class found:', enhancedClassData.title);
      console.log('📊 Returning class with variants:', enhancedClassData.variants ? enhancedClassData.variants.length : 0);
      res.json(enhancedClassData);
    } catch (error) {
      console.error('❌ Error loading class:', error);
      res.status(500).json({ message: 'Error loading class' });
    }
  });

  // Class update endpoint - migrated to PostgreSQL with authentication
  app.put("/api/class-details/:id", supabaseAuth, async (req: any, res) => {
    const classId = parseInt(req.params.id);
    console.log('📝 Updating class with ID:', classId);
    console.log('📄 Update data:', JSON.stringify(req.body, null, 2));

    try {
      // Validate school context from JWT token
      const schoolId = requireSchoolContext(req, res);
      if (schoolId === null) return;

      if (isNaN(classId)) {
        return res.status(400).json({ message: 'Invalid class ID' });
      }

      // Fetch existing class from database
      const existingClass = await storage.getClassById(classId);
      if (!existingClass) {
        console.log('❌ Class not found with ID:', classId);
        return res.status(404).json({ message: 'Class not found' });
      }

      // Enforce school boundary - prevent cross-school access
      if (existingClass.schoolId !== schoolId) {
        console.log(`🚨 School boundary violation - Class ${classId} belongs to school ${existingClass.schoolId}, but user is from school ${schoolId}`);
        return res.status(403).json({ message: 'Access denied: Class belongs to a different school' });
      }

      // Extract price from variants array (same logic as POST endpoint)
      let price = existingClass.price;
      let schedule = existingClass.schedule;

      if (req.body.variants && Array.isArray(req.body.variants) && req.body.variants.length > 0) {
        // Extract price from first variant
        const firstVariant = req.body.variants[0];
        price = firstVariant.price || 0;
        
        // Store full variants in schedule field
        schedule = { variants: req.body.variants };
        
        console.log('💰 Extracted price from variants:', price);
        console.log('📅 Schedule data with variants:', JSON.stringify(schedule));
      } else if (req.body.price !== undefined) {
        // Fallback to direct price if no variants
        price = req.body.price;
      }

      // Handle gradeLevels array
      let gradeLevel = existingClass.gradeLevel;
      if (req.body.gradeLevels && Array.isArray(req.body.gradeLevels) && req.body.gradeLevels.length > 0) {
        gradeLevel = req.body.gradeLevels[0];
      } else if (req.body.gradeLevel) {
        gradeLevel = req.body.gradeLevel;
      }

      // Handle instructorId - ensure it's a number
      let instructorId = existingClass.instructorId;
      if (req.body.instructorName) {
        const instructorIdStr = req.body.instructorName;
        instructorId = parseInt(instructorIdStr);
        if (isNaN(instructorId)) {
          instructorId = existingClass.instructorId;
        }
      }

      // Build update data object
      const updateData: any = {
        title: req.body.title || existingClass.title,
        description: req.body.description || existingClass.description,
        category: req.body.category || existingClass.category,
        gradeLevel: gradeLevel,
        status: req.body.status || existingClass.status,
        startDate: req.body.startDate || existingClass.startDate,
        endDate: req.body.endDate || existingClass.endDate,
        schedule: schedule,
        capacity: req.body.capacity !== undefined ? req.body.capacity : existingClass.capacity,
        instructorId: instructorId,
        price: price,
        isAdminOnly: req.body.isAdminOnly !== undefined ? req.body.isAdminOnly : existingClass.isAdminOnly
      };

      // Update in database
      const updatedClass = await storage.updateClass(classId, updateData);

      if (!updatedClass) {
        return res.status(500).json({ message: 'Failed to update class' });
      }

      // Parse variants from schedule for response (match GET endpoint behavior)
      let enhancedClassData = { ...updatedClass };
      if (updatedClass.schedule && typeof updatedClass.schedule === 'object') {
        const scheduleObj = updatedClass.schedule as any;
        if (scheduleObj.variants && Array.isArray(scheduleObj.variants)) {
          enhancedClassData.variants = scheduleObj.variants;
        }
      }

      console.log('✅ Class updated successfully:', updatedClass.title);
      console.log('📊 Saved schedule:', updatedClass.schedule);
      console.log('💰 Saved price:', updatedClass.price);
      res.json(enhancedClassData);
    } catch (error) {
      console.error('❌ Error updating class:', error);
      res.status(500).json({ message: 'Error updating class' });
    }
  });

  // Direct route for knowledge bases to bypass schools router issue
  app.get("/api/schools/knowledge-bases", async (req, res) => {
    try {
      let allKnowledgeBases = [];

      try {
        // Try to get knowledge bases from storage
        allKnowledgeBases = await storage.getAllKnowledgeBases();
      } catch (dbError) {
        console.error("Database error fetching knowledge bases, falling back to file storage:", dbError);

        // Fallback to file storage directly
        try {
          const fs = await import('fs');
          const path = await import('path');
          const kbFilePath = path.join(process.cwd(), 'data', 'knowledge-bases.json');

          if (fs.existsSync(kbFilePath)) {
            const fileContent = fs.readFileSync(kbFilePath, 'utf-8');
            allKnowledgeBases = JSON.parse(fileContent);
            console.log(`✅ Loaded ${allKnowledgeBases.length} knowledge bases from file storage`);
          } else {
            console.log('⚠️ No knowledge-bases.json file found');
            allKnowledgeBases = [];
          }
        } catch (fileError) {
          console.error("File storage also failed:", fileError);
          allKnowledgeBases = [];
        }
      }

      // Transform the data to match the expected format for the UI
      const transformedKnowledgeBases = allKnowledgeBases.map(kb => ({
        id: kb.id,
        title: kb.title,
        description: kb.description,
        subjectArea: kb.subject,
        gradeLevel: kb.difficulty ? [kb.difficulty] : ["All Levels"],
        status: kb.isPublic ? "Published" : "Draft",
        visibility: kb.isPublic ? "Public" : "Private",
        fileCount: kb.files ? kb.files.length : 0,
        size: "0 MB", // Default size since not available in current data
        createdAt: kb.createdAt ? new Date(kb.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        updatedAt: kb.updatedAt ? new Date(kb.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        tags: kb.metadata?.tags || [],
        creator: "Admin", // Default creator since authorName not available
        rating: 4.5, // Default rating
        usageCount: kb.downloadCount || 0,
      }));

      res.json(transformedKnowledgeBases);
    } catch (error) {
      console.error("Error fetching knowledge bases:", error);
      console.error("Error details:", error.message);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  });

  // Admin endpoint to sync user metadata to Supabase (one-time migration fix)
  app.post("/api/auth/sync-metadata", supabaseAuth, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(400).json({ message: "User email not found" });
      }

      // Get user from database
      const dbUser = await storage.getUserByEmail(userEmail);
      if (!dbUser || !dbUser.schoolId) {
        return res.status(404).json({ message: "User not found or has no school" });
      }

      // Update Supabase user metadata
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ message: "Supabase configuration missing" });
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      // Get the Supabase user ID
      const { data: { user: supabaseUser }, error: getUserError } = await supabaseAdmin.auth.getUser(req.headers.authorization?.substring(7) || '');
      
      if (getUserError || !supabaseUser) {
        return res.status(404).json({ message: "Supabase user not found", error: getUserError?.message });
      }

      // Update user metadata with school_id
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        supabaseUser.id,
        {
          user_metadata: {
            ...supabaseUser.user_metadata,
            school_id: dbUser.schoolId,
            role: dbUser.role,
            name: dbUser.name
          }
        }
      );

      if (error) {
        console.error('❌ Failed to update Supabase metadata:', error);
        return res.status(500).json({ message: "Failed to update metadata", error: error.message });
      }

      console.log(`✅ Successfully synced metadata for ${userEmail} with school_id=${dbUser.schoolId}`);
      
      res.json({ 
        message: "Metadata synced successfully. Please log out and log back in for changes to take effect.",
        school_id: dbUser.schoolId
      });
    } catch (error) {
      console.error("Error syncing metadata:", error);
      res.status(500).json({ message: "Error syncing metadata", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.use("/api/schools", schoolsRouter);
  app.use("/api/school-admin", schoolAdminRouter);
  app.use("/api/educator", educatorRouter);
  app.use("/api/parent", parentRouter);
  app.use("/api/custom-forms", customFormsRouter);
  
  // School Admin Child Management endpoints (with JWT auth for school admins)
  // Delete child as school admin
  app.delete("/api/school-admin/children/:id", jwtCheck, requireRole(['schoolAdmin', 'superAdmin', 'admin']), async (req: any, res: any) => {
    try {
      const childId = parseInt(req.params.id);
      
      if (isNaN(childId)) {
        return res.status(400).json({ message: 'Invalid child ID' });
      }

      console.log('🗑️ Deleting child with ID:', childId);

      // First, get the child data before deleting
      const child = await storage.getChild(childId);
      
      if (!child) {
        return res.status(404).json({ message: 'Child not found' });
      }

      // Now delete the child record
      await storage.deleteChild(childId);

      // Also delete the corresponding school student record
      try {
        const schoolStudents = await storage.getAllSchoolStudents();
        const schoolStudent = schoolStudents.find(ss => ss.childId === childId);
        
        if (schoolStudent) {
          await storage.deleteSchoolStudent(schoolStudent.id);
          console.log('✅ Also deleted school student record with ID:', schoolStudent.id);
        }
      } catch (schoolStudentError) {
        console.warn('⚠️ Failed to delete school student record:', schoolStudentError);
        // Don't fail the entire operation if school student deletion fails
      }

      console.log('✅ Child deleted successfully:', child.firstName, child.lastName);

      res.json({
        success: true,
        message: 'Child deleted successfully',
        child: {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName
        }
      });

    } catch (error) {
      console.error('❌ Error deleting child:', error);
      res.status(500).json({ 
        message: 'Failed to delete child',
        error: error.message 
      });
    }
  });

  app.post("/api/school-admin/children", jwtCheck, requireRole(['schoolAdmin', 'superAdmin']), async (req: any, res) => {
    try {
      console.log('👶 School admin child creation endpoint hit');
      console.log('📝 Request body:', JSON.stringify(req.body, null, 2));

      // Extract school_id from authenticated user's token metadata
      const schoolId = req.auth?.payload?.school_id;
      if (!schoolId) {
        return res.status(400).json({ message: "School ID not found in user metadata" });
      }

      const {
        firstName,
        lastName,
        birthdate,
        gradeLevel,
        parentEmail,
        allergies,
        medicalInfo,
        additionalLanguages,
        notes
      } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !birthdate || !gradeLevel || !parentEmail) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      console.log('👤 Creating child for parent:', parentEmail);

      // Create child data object
      const childData = {
        firstName,
        lastName,
        birthdate,
        gradeLevel,
        parentEmail,
        specialNeeds: null,
        medicalInfo: medicalInfo || null,
        interests: null,
        emergencyContact: null,
        profileImage: null,
        school: null,
        learningStyle: null,
        allergies: allergies || null,
        additionalLanguages: additionalLanguages || null,
        notes: notes || null
      };

      console.log('📋 Child data to create:', JSON.stringify(childData, null, 2));

      // Check for potential duplicate before creating
      const existingChildren = await storage.getAllChildren();
      const isDuplicate = existingChildren.some(child => 
        child.firstName.toLowerCase() === firstName.toLowerCase() && 
        child.lastName.toLowerCase() === lastName.toLowerCase() && 
        child.parentEmail === parentEmail &&
        child.birthdate === birthdate
      );

      if (isDuplicate) {
        console.warn('⚠️ Potential duplicate child detected:', { firstName, lastName, parentEmail });
        return res.status(400).json({
          success: false,
          message: 'A child with the same name, birthdate, and parent already exists',
          code: 'DUPLICATE_CHILD'
        });
      }

      // Create the child using storage
      const newChild = await storage.createChild(childData);

      console.log('✅ Child created successfully:', {
        id: newChild.id,
        firstName: newChild.firstName,
        lastName: newChild.lastName
      });

      // Also create a school student record to link this child to the school system
      console.log('🎓 Creating school student record for child ID:', newChild.id);
      let schoolStudent = null;
      try {
        const schoolStudentData = {
          childId: newChild.id,
          schoolId, // Use authenticated user's school ID
          enrollmentDate: new Date().toISOString(),
          status: 'active', // Use lowercase 'active' to match existing data
          locationId: null // Location can be assigned later
        };

        console.log('🎓 School student data:', JSON.stringify(schoolStudentData, null, 2));
        schoolStudent = await storage.createSchoolStudent(schoolStudentData);
        console.log('✅ School student record created successfully:', {
          schoolStudentId: schoolStudent.id,
          childId: schoolStudent.childId,
          status: schoolStudent.status
        });
      } catch (schoolStudentError) {
        console.error('❌ Failed to create school student record:', schoolStudentError);
        console.error('❌ Error details:', {
          message: schoolStudentError.message,
          stack: schoolStudentError.stack
        });
        
        // Rollback: Delete the child record if school student creation fails
        console.log('🔄 Rolling back child creation due to school student error...');
        try {
          await storage.deleteChild(newChild.id);
          console.log('✅ Child record rolled back successfully');
        } catch (rollbackError) {
          console.error('❌ Failed to rollback child creation:', rollbackError);
        }
        
        throw new Error(`Failed to create complete student record: ${schoolStudentError.message}`);
      }

      res.json({
        success: true,
        message: 'Child created successfully',
        child: {
          id: newChild.id,
          firstName: newChild.firstName,
          lastName: newChild.lastName,
          parentEmail: parentEmail
        }
      });

    } catch (error) {
      console.error('❌ Error creating child for school admin:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to create child',
        error: error.message 
      });
    }
  });

  app.patch("/api/school-admin/children/:id", jwtCheck, requireRole(['schoolAdmin', 'superAdmin']), async (req, res) => {
    try {
      const childId = parseInt(req.params.id);
      const updateData = req.body;

      if (isNaN(childId)) {
        return res.status(400).json({ message: 'Invalid child ID' });
      }

      console.log(`📝 School admin updating child ${childId} with data:`, JSON.stringify(updateData, null, 2));

      // Update the child using the storage system
      const updatedChild = await storage.updateChild(childId, updateData);

      if (!updatedChild) {
        return res.status(404).json({ message: "Child not found" });
      }

      console.log(`✅ Child ${childId} updated successfully by school admin:`, updatedChild.firstName, updatedChild.lastName);

      return res.status(200).json({
        message: "Child updated successfully",
        id: childId,
        child: updatedChild
      });
    } catch (error) {
      console.error("Error updating child for school admin:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.use("/api/parent-profile", parentProfileRouter);
  
  // Multi-location support routes
  const locationsRouter = (await import("./api/locations")).default;
  app.use("/api/locations", jwtCheck, locationsRouter);
  
  const notificationsRouter = (await import("./api/notifications")).default;
  app.use("/api/notifications", jwtCheck, notificationsRouter);

  // Register billing routes
  const billingRouter = (await import("./api/billing")).default;
  app.use("/api/billing", billingRouter);

  // Register payment history routes
  const paymentHistoryRouter = (await import("./api/payment-history")).default;
  app.use("/api/payment-history", paymentHistoryRouter);

  // General enrollments endpoint for dashboard
  app.get("/api/enrollments", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.auth;
      if (!user || !user.email) {
        return res.status(401).json({ message: "Authentication required" });
      }

      console.log('📚 Fetching all enrollments for parent:', user.email);

      // Get all children for this parent
      const children = await storage.getChildrenByParentEmail(user.email);
      console.log(`👶 Found ${children.length} children for parent ${user.email}`);

      if (children.length === 0) {
        return res.json([]);
      }

      // Get enrollments for all children
      let allEnrollments: any[] = [];
      for (const child of children) {
        const childEnrollments = await storage.getEnrollmentsByChildId(child.id);
        allEnrollments = allEnrollments.concat(childEnrollments);
      }

      console.log(`📚 Found ${allEnrollments.length} total enrollments for parent ${user.email}`);
      res.json(allEnrollments);
    } catch (error) {
      console.error('Error fetching enrollments:', error);
      res.status(500).json({ message: 'Failed to fetch enrollments' });
    }
  });

  // Registration routes
  const registrationRouter = (await import("./api/registration")).default;
  app.use("/api/registration", registrationRouter);
  app.use("/api/admin/role-invitations", roleInvitationsRouter);

  // School Applications route
  const schoolApplicationsRouter = await import("./api/school-applications");
  app.use("/api/school-applications", schoolApplicationsRouter.default);

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
  app.get("/api/children", jwtCheck, async (req, res) => {
    try {
      // Extract access token from Authorization header
      const accessToken = req.headers.authorization?.substring(7); // Remove 'Bearer ' prefix

      if (!accessToken) {
        return res.status(401).json({ error: "No token provided" });
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
        return res.status(401).json({ error: "Failed to authenticate with Auth0" });
      }

      const userInfo = await userInfoResponse.json();
      const userEmail = userInfo.email;

      console.log('📧 User email from Auth0 userinfo:', userEmail);

      if (!userEmail) {
        console.log('❌ No email found in Auth0 userinfo');
        return res.status(401).json({ error: "Email not found in user profile" });
      }

      // Get user profile data to find the user ID
      const userProfilePath = path.join(process.cwd(), 'data', 'user-profiles.json');
      let userProfile = null;

      try {
        const userProfileData = fs.readFileSync(userProfilePath, 'utf8');
        const userProfiles = JSON.parse(userProfileData);
        // User profiles are stored as object with email keys
        userProfile = userProfiles[userEmail];
      } catch (error) {
        console.log('No user profile data found');
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

      // Filter children that match the parent's ID or email
      const parentChildren = children.filter(child => {
        // Match by parentId if user profile found, otherwise match by email
        if (userProfile && userProfile.id) {
          return child.parentId === parseInt(userProfile.id) || 
                 child.parentEmail === userEmail;
        } else {
          return child.parentEmail === userEmail;
        }
      }).map(child => {
        // Calculate age from birthdate
        const age = calculateAge(child.birthdate);
        return { ...child, age };
      });

      console.log(`👨‍👩‍👧‍👦 Found ${parentChildren.length} children for parent: ${userEmail}`);
      console.log('Children found:', parentChildren.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName })));

      res.json(parentChildren);

    } catch (error) {
      console.error("Error fetching children:", error);
      res.status(500).json({ error: "Error fetching children data" });
    }
  });

  // Children registration endpoint for parents
  app.post("/api/children", isAuthenticated, async (req, res) => {
    console.log('👶 Child registration endpoint hit');
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));

    try {
      const {
        firstName,
        lastName,
        birthdate,
        gradeLevel,
        specialNeeds,
        medicalNotes,
        interests,
        emergencyContact
      } = req.body;

      // Get parent email from Supabase authentication
      const supabaseAuth = (req as any).supabaseAuth;
      if (!supabaseAuth || !supabaseAuth.email) {
        console.error('❌ No authenticated user found');
        return res.status(401).json({ message: 'Authentication required' });
      }

      const parentEmail = supabaseAuth.email;
      console.log('👤 Creating child for parent:', parentEmail);

      // Get the parent user to retrieve their ID
      const parent = await storage.getUserByEmail(parentEmail);
      if (!parent) {
        console.error('❌ Parent user not found for email:', parentEmail);
        return res.status(404).json({ 
          success: false,
          message: 'Parent user not found' 
        });
      }

      console.log('👤 Found parent with ID:', parent.id);

      // Create child data object with parentId
      const childData = {
        firstName,
        lastName,
        birthdate,
        gradeLevel,
        parentEmail,
        parentId: parent.id,  // 🔧 ADDED: Include parentId for database storage
        specialNeeds: specialNeeds || null,
        medicalInfo: medicalNotes || null,
        interests: interests || [],
        emergencyContact: emergencyContact || null,
        profileImage: null,
        school: null,
        learningStyle: null,
        allergies: null
      };

      console.log('📋 Child data to create:', JSON.stringify(childData, null, 2));

      // Create the child using storage
      const newChild = await storage.createChild(childData);

      console.log('✅ Child created successfully:', {
        id: newChild.id,
        firstName: newChild.firstName,
        lastName: newChild.lastName
      });

      res.json({
        success: true,
        message: 'Child registered successfully',
        child: {
          id: newChild.id,
          firstName: newChild.firstName,
          lastName: newChild.lastName,
          parentEmail: parentEmail
        }
      });

    } catch (error) {
      console.error('❌ Error registering child:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to register child',
        error: error.message 
      });
    }
  });

  // Test authentication endpoint
  app.get("/api/test-auth", jwtCheck, (req: any, res) => {
    res.json({
      message: "Authentication successful",
      user: req.auth,
      email: req.auth?.email,
      userId: req.auth?.userId
    });
  });

  // AI Enrollment Assistant endpoint
  app.post("/api/ai/enrollment-assistant", jwtCheck, handleEnrollmentMessage);



  // Serve uploaded files (including PDFs)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Register technical support routes
  registerTechnicalSupportRoutes(app);

  const httpServer = createServer(app);
  
  // Initialize WebSocket data layer for real-time updates
  try {
    const { dataLayer } = await import('./services/dataLayer.js');
    dataLayer.init(httpServer);
    console.log('🔌 Real-time data layer initialized');
  } catch (error) {
    console.error('❌ Failed to initialize data layer:', error);
  }
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

  // Knowledge base file upload routes
  app.post("/api/knowledge-bases/:id/upload", isAuthenticated, uploadKnowledgeBaseFiles);
  app.get("/api/knowledge-bases/processing/:jobId", isAuthenticated, getProcessingStatus);
  app.get("/api/knowledge-bases/processing-stats", isAuthenticated, getProcessingStats);

  // Auth routes
  const authRoutes = await import("./api/auth");
  app.use("/api/auth", authRoutes.default);

  // User management routes
  const userManagementModule = await import("./api/user-management");
  app.use("/api/user-management", userManagementModule.default);

  return httpServer;
}
// Knowledge base routes
async function getPublicKnowledgeBases(req: any, res: any) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const knowledgeBases = await storage.getPublicKnowledgeBases(limit);
    res.status(200).json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching public knowledge bases:", error);
    res.status(500).json({ message: "Error fetching public knowledge bases" });
  }
}

async function getKnowledgeBasesBySubject(req: any, res: any) {
  try {
    const { subject } = req.params;
    const knowledgeBases = await storage.getKnowledgeBasesBySubject(subject);
    res.status(200).json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching knowledge bases by subject:", error);
    res.status(500).json({ message: "Error fetching knowledge bases" });
  }
}

async function getKnowledgeBasesByAuthor(req: any, res: any) {
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
}

async function getKnowledgeBaseById(req: any, res: any) {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);

    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    res.status(200).json(knowledgeBase);
  } catch (error) {
    console.error("Error fetching knowledge base:", error);
    res.status(500).json({ message: "Error fetching knowledge base" });
  }
}

async function createKnowledgeBase(req: any, res: any) {
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
    res.status(500).json({ message: "Error creating knowledge base" });
  }
}

async function updateKnowledgeBase(req: any, res: any) {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
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
}

async function incrementDownloadCount(req: any, res: any) {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const updatedKnowledgeBase = await storage.incrementDownloadCount(knowledgeBaseId);
    res.status(200).json(updatedKnowledgeBase);
  } catch (error) {
    console.error("Error incrementing download count:", error);
    res.status(500).json({ message: "Error incrementing download count" });
  }
}

async function recordPurchase(req: any, res: any) {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    await storage.addPurchaser(knowledgeBaseId, req.session.userId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error recording purchase:", error);
    res.status(500).json({ message: "Error recording purchase" });
  }
}

async function getCombinedKnowledgeBases(req: any, res: any) {
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
            const authData = (req as any).auth;
            if (authData?.userId) {
                userKnowledgeBases = await storage.getKnowledgeBasesByAuthor(authData.userId);
            }
        } catch (userError) {
            console.error("Error fetching user knowledge bases:", userError);
            // Continue with empty array if failed
        }

        //// Combine and deduplicate knowledge bases
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
}