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
router.post("/", async (req, res) => {
  try {
    const validatedData = insertLocationSchema.parse(req.body);
    
    // Use the storage system that the overview endpoint uses
    const location = await storage.createLocation(validatedData);
    
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