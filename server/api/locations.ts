import express from "express";
import { z } from "zod";
import { insertLocationSchema, insertUserLocationSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireSchoolContext } from "../middleware/require-school-context";

const router = express.Router();

// ROUTE ORDER MATTERS: Static paths must come before parameterized paths
// to prevent Express from treating "accessible" as an ID

// Get all locations for a school
router.get("/", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
    // If a query parameter is provided, validate it matches the authenticated school
    if (req.query.schoolId) {
      const requestedSchoolId = parseInt(req.query.schoolId as string);
      
      if (isNaN(requestedSchoolId)) {
        return res.status(400).json({ message: "Invalid school ID in query parameter" });
      }
      
      // SECURITY: Prevent cross-tenant data access
      if (requestedSchoolId !== authenticatedSchoolId) {
        console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to access locations from school ${requestedSchoolId}`);
        return res.status(403).json({ 
          message: "Access denied - you can only view locations for your own school" 
        });
      }
    }
    
    // Use the authenticated user's school ID
    const schoolId = authenticatedSchoolId;

    console.log('🏢 Fetching locations for school ID:', schoolId);
    // Get all locations for the school from database
    const locations = await storage.getLocationsBySchoolId(schoolId);
    console.log('✅ Found locations:', locations.length);
    res.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ message: "Failed to fetch locations" });
  }
});

// Get accessible locations for a user (BEFORE /:id to prevent route shadowing)
router.get("/accessible", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
    const userId = parseInt(req.query.userId as string);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Valid user ID required" });
    }

    // SECURITY: Verify user belongs to authenticated user's school to prevent enumeration
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (user.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to access locations for user ${userId} from school ${user.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this user belongs to a different school" 
      });
    }

    // Get locations the user has access to from database
    const accessibleLocations = await storage.getUserAccessibleLocations(userId);
    
    // SECURITY: Filter to only locations belonging to authenticated user's school (defense in depth)
    const schoolFilteredLocations = accessibleLocations.filter(
      location => location.schoolId === authenticatedSchoolId
    );
    
    if (accessibleLocations.length !== schoolFilteredLocations.length) {
      console.warn(`🚨 Security: Filtered ${accessibleLocations.length - schoolFilteredLocations.length} cross-tenant locations for user ${userId}`);
    }
    
    res.json(schoolFilteredLocations);
  } catch (error) {
    console.error("Error fetching accessible locations:", error);
    res.status(500).json({ message: "Failed to fetch accessible locations" });
  }
});

// Get a single location by ID (AFTER /accessible to prevent shadowing)
router.get("/:id", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    // Fetch the location
    const location = await storage.getLocationById(id);
    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }
    
    // SECURITY: Verify location belongs to authenticated user's school
    if (location.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to access location ${id} from school ${location.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this location belongs to a different school" 
      });
    }

    res.json(location);
  } catch (error) {
    console.error("Error fetching location:", error);
    res.status(500).json({ message: "Failed to fetch location" });
  }
});

// Create a new location
router.post("/", requireSchoolContext, async (req: any, res) => {
  try {
    console.log('📍 Location creation request received');
    console.log('📍 Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      contentType: req.headers['content-type']
    });
    console.log('📍 req.auth exists:', !!req.auth);
    console.log('📍 req.user exists:', !!req.user);
    
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;
    console.log('🔐 Location creation - School ID:', schoolId);
    
    // Validate that the school exists
    const school = await storage.getSchool(schoolId);
    if (!school) {
      console.error(`❌ School not found for ID ${schoolId}`);
      return res.status(404).json({ 
        message: "School not found. Please contact support." 
      });
    }
    
    console.log(`✅ Creating location for school ${school.name} (ID: ${school.id})`);
    
    // SECURITY: Use the authenticated user's schoolId from JWT, ignoring client-provided value
    const validatedData = insertLocationSchema.parse(req.body);
    const locationData = {
      ...validatedData,
      schoolId: schoolId  // Override with JWT-authenticated school
    };
    
    // Create location using authenticated school
    const location = await storage.createLocation(locationData);
    
    res.status(201).json(location);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Error creating location:", error);
    res.status(500).json({ message: "Failed to create location" });
  }
});

// Update a location
router.put("/:id", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    // Fetch existing location to verify ownership
    const existingLocation = await storage.getLocationById(id);
    if (!existingLocation) {
      return res.status(404).json({ message: "Location not found" });
    }
    
    // SECURITY: Verify location belongs to authenticated user's school
    if (existingLocation.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to update location ${id} from school ${existingLocation.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this location belongs to a different school" 
      });
    }

    const validatedData = insertLocationSchema.partial().parse(req.body);
    
    // SECURITY: Ensure schoolId cannot be changed via update
    const updateData = {
      ...validatedData,
      schoolId: authenticatedSchoolId  // Enforce authenticated school
    };
    
    const location = await storage.updateLocation(id, updateData);

    res.json(location);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Error updating location:", error);
    res.status(500).json({ message: "Failed to update location" });
  }
});

// Delete a location
router.delete("/:id", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    // Fetch existing location to verify ownership
    const existingLocation = await storage.getLocationById(id);
    if (!existingLocation) {
      return res.status(404).json({ message: "Location not found" });
    }
    
    // SECURITY: Verify location belongs to authenticated user's school
    if (existingLocation.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to delete location ${id} from school ${existingLocation.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this location belongs to a different school" 
      });
    }

    // Delete the location
    await storage.deleteLocation(id);

    res.json({ message: "Location deleted successfully" });
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ message: "Failed to delete location" });
  }
});

// Assign user access to a location
router.post("/access", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
    const validatedData = insertUserLocationSchema.parse(req.body);
    
    // SECURITY: Verify location belongs to authenticated user's school
    const location = await storage.getLocationById(validatedData.locationId);
    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }
    
    if (location.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to assign access to location ${validatedData.locationId} from school ${location.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this location belongs to a different school" 
      });
    }
    
    // SECURITY: Verify user belongs to authenticated user's school
    const user = await storage.getUser(validatedData.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (user.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to assign access for user ${validatedData.userId} from school ${user.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this user belongs to a different school" 
      });
    }
    
    const userLocation = await storage.createUserLocation(validatedData);
    
    res.status(201).json(userLocation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Error creating user location access:", error);
    res.status(500).json({ message: "Failed to create user location access" });
  }
});

// Remove user access from a location
router.delete("/access/:userId/:locationId", async (req: any, res) => {
  try {
    // SECURITY: Verify authenticated user's school
    const schoolIdFromToken = req.auth?.payload?.school_id;
    
    if (!schoolIdFromToken) {
      return res.status(401).json({ 
        message: "Authentication required - school ID not found in token" 
      });
    }
    
    const authenticatedSchoolId = Number(schoolIdFromToken);
    if (isNaN(authenticatedSchoolId)) {
      return res.status(400).json({ message: "Invalid school ID in authentication token" });
    }
    
    const userId = parseInt(req.params.userId);
    const locationId = parseInt(req.params.locationId);
    
    if (isNaN(userId) || isNaN(locationId)) {
      return res.status(400).json({ message: "Invalid user ID or location ID" });
    }

    // SECURITY: Verify location belongs to authenticated user's school
    const location = await storage.getLocationById(locationId);
    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }
    
    if (location.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to remove access to location ${locationId} from school ${location.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this location belongs to a different school" 
      });
    }
    
    // SECURITY: Verify user belongs to authenticated user's school
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (user.schoolId !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to remove access for user ${userId} from school ${user.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this user belongs to a different school" 
      });
    }

    await storage.deleteUserLocation(userId, locationId);

    res.json({ message: "User location access removed successfully" });
  } catch (error) {
    console.error("Error removing user location access:", error);
    res.status(500).json({ message: "Failed to remove user location access" });
  }
});

export default router;