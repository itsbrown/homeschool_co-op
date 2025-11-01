import express from "express";
import { z } from "zod";
import { insertLocationSchema, insertUserLocationSchema } from "@shared/schema";
import { storage } from "../storage";

const router = express.Router();

// Get all locations for a school
router.get("/", async (req, res) => {
  try {
    const schoolId = parseInt(req.query.schoolId as string);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Valid school ID required" });
    }

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

// Get a single location by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    // Use the storage system that the overview endpoint uses
    const location = await storage.getLocationById(id);
    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }

    res.json(location);
  } catch (error) {
    console.error("Error fetching location:", error);
    res.status(500).json({ message: "Failed to fetch location" });
  }
});

// Get accessible locations for a user
router.get("/accessible", async (req, res) => {
  try {
    const userId = parseInt(req.query.userId as string);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Valid user ID required" });
    }

    // Get locations the user has access to from database
    const accessibleLocations = await storage.getUserAccessibleLocations(userId);
    res.json(accessibleLocations);
  } catch (error) {
    console.error("Error fetching accessible locations:", error);
    res.status(500).json({ message: "Failed to fetch accessible locations" });
  }
});

// Create a new location
router.post("/", async (req: any, res) => {
  try {
    // Get authenticated user's email from auth middleware
    const userEmail = req.user?.email;
    console.log('🔐 Location creation - authenticated user email:', userEmail);
    console.log('🔐 Request user object:', JSON.stringify(req.user, null, 2));
    console.log('🔐 Request auth object:', JSON.stringify(req.auth, null, 2));
    
    if (!userEmail) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Fetch user from database to get their schoolId
    const user = await storage.getUserByEmail(userEmail);
    console.log('👤 Database user lookup result:', user ? { id: user.id, email: user.email, schoolId: user.schoolId, role: user.role } : 'NOT FOUND');
    
    if (!user) {
      return res.status(404).json({ message: "User not found in database. Please complete registration." });
    }
    
    // Verify user has a school assignment
    if (!user.schoolId) {
      console.error(`❌ User ${userEmail} exists but has no schoolId assigned`);
      return res.status(403).json({ 
        message: "Unable to determine your school. Please contact support." 
      });
    }
    
    // SECURITY: Use the authenticated user's schoolId, ignoring client-provided value
    const validatedData = insertLocationSchema.parse(req.body);
    const locationData = {
      ...validatedData,
      schoolId: user.schoolId  // Override with authenticated user's school
    };
    
    // Validate that the school exists (should always pass since user is linked to it)
    const school = await storage.getSchool(locationData.schoolId);
    if (!school) {
      console.error(`❌ Integrity error: User ${user.id} linked to non-existent school ${user.schoolId}`);
      return res.status(500).json({ 
        message: "School configuration error. Please contact support." 
      });
    }
    
    console.log(`✅ User ${userEmail} creating location for school ${school.name} (ID: ${school.id})`);
    
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
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    const validatedData = insertLocationSchema.partial().parse(req.body);
    const location = await storage.updateLocation(id, validatedData);

    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }

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
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid location ID" });
    }

    // Use the storage system that the overview endpoint uses
    await storage.deleteLocation(id);

    res.json({ message: "Location deleted successfully" });
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ message: "Failed to delete location" });
  }
});

// Assign user access to a location
router.post("/access", async (req, res) => {
  try {
    const validatedData = insertUserLocationSchema.parse(req.body);
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
router.delete("/access/:userId/:locationId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const locationId = parseInt(req.params.locationId);
    
    if (isNaN(userId) || isNaN(locationId)) {
      return res.status(400).json({ message: "Invalid user ID or location ID" });
    }

    await storage.deleteUserLocation(userId, locationId);

    res.json({ message: "User location access removed successfully" });
  } catch (error) {
    console.error("Error removing user location access:", error);
    res.status(500).json({ message: "Failed to remove user location access" });
  }
});

export default router;