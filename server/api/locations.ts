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

    // Get all locations for the school
    const locations = await getLocationsBySchool(schoolId);
    res.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ message: "Failed to fetch locations" });
  }
});

// Get accessible locations for a user
router.get("/accessible", async (req, res) => {
  try {
    const userId = parseInt(req.query.userId as string);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Valid user ID required" });
    }

    // Get locations the user has access to
    const accessibleLocations = await getUserAccessibleLocations(userId);
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
    
    // Create location in file storage for now
    const location = await createLocation(validatedData);
    
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
    const location = await updateLocation(id, validatedData);

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

    const success = await deleteLocation(id);
    if (!success) {
      return res.status(404).json({ message: "Location not found" });
    }

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
    const userLocation = await createUserLocationAccess(validatedData);
    
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

    const success = await removeUserLocationAccess(userId, locationId);
    if (!success) {
      return res.status(404).json({ message: "User location access not found" });
    }

    res.json({ message: "User location access removed successfully" });
  } catch (error) {
    console.error("Error removing user location access:", error);
    res.status(500).json({ message: "Failed to remove user location access" });
  }
});

// **FILE-BASED STORAGE IMPLEMENTATION**
// (will be replaced with database operations when available)

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const USER_LOCATIONS_FILE = path.join(DATA_DIR, 'user-locations.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface LocationData {
  id: number;
  schoolId: number;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  managerName?: string;
  capacity?: number;
  isActive: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

interface UserLocationData {
  id: number;
  userId: number;
  locationId: number;
  accessLevel: "view" | "manage" | "admin";
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageClasses: boolean;
  canManageStudents: boolean;
  canSendNotifications: boolean;
  isActive: boolean;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
}

let locationIdCounter = 1;
let userLocationIdCounter = 1;

function loadLocations(): LocationData[] {
  if (!fs.existsSync(LOCATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(LOCATIONS_FILE, 'utf8');
    const locations = JSON.parse(data);
    // Update counter to avoid ID conflicts
    if (locations.length > 0) {
      locationIdCounter = Math.max(...locations.map((l: any) => l.id)) + 1;
    }
    return locations;
  } catch (error) {
    console.error('Error loading locations:', error);
    return [];
  }
}

function saveLocations(locations: LocationData[]): void {
  try {
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
  } catch (error) {
    console.error('Error saving locations:', error);
  }
}

function loadUserLocations(): UserLocationData[] {
  if (!fs.existsSync(USER_LOCATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(USER_LOCATIONS_FILE, 'utf8');
    const userLocations = JSON.parse(data);
    // Update counter to avoid ID conflicts
    if (userLocations.length > 0) {
      userLocationIdCounter = Math.max(...userLocations.map((ul: any) => ul.id)) + 1;
    }
    return userLocations;
  } catch (error) {
    console.error('Error loading user locations:', error);
    return [];
  }
}

function saveUserLocations(userLocations: UserLocationData[]): void {
  try {
    fs.writeFileSync(USER_LOCATIONS_FILE, JSON.stringify(userLocations, null, 2));
  } catch (error) {
    console.error('Error saving user locations:', error);
  }
}

// Get all locations for a specific school
async function getLocationsBySchool(schoolId: number): Promise<LocationData[]> {
  const locations = loadLocations();
  return locations.filter(location => 
    location.schoolId === schoolId && location.isActive
  );
}

async function getUserAccessibleLocations(userId: number): Promise<LocationData[]> {
  const locations = loadLocations();
  const userLocations = loadUserLocations();
  
  const accessibleLocationIds = userLocations
    .filter(ul => ul.userId === userId && ul.isActive)
    .map(ul => ul.locationId);
  
  return locations.filter(location => 
    accessibleLocationIds.includes(location.id) && location.isActive
  );
}

async function createLocation(locationData: any): Promise<LocationData> {
  const locations = loadLocations();
  
  const newLocation: LocationData = {
    id: locationIdCounter++,
    ...locationData,
    isActive: true,
    timezone: locationData.timezone || "America/New_York",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  locations.push(newLocation);
  saveLocations(locations);
  
  return newLocation;
}

async function updateLocation(id: number, updateData: any): Promise<LocationData | null> {
  const locations = loadLocations();
  const index = locations.findIndex(location => location.id === id);
  
  if (index === -1) {
    return null;
  }
  
  locations[index] = {
    ...locations[index],
    ...updateData,
    updatedAt: new Date().toISOString(),
  };
  
  saveLocations(locations);
  return locations[index];
}

async function deleteLocation(id: number): Promise<boolean> {
  const locations = loadLocations();
  const index = locations.findIndex(location => location.id === id);
  
  if (index === -1) {
    return false;
  }
  
  // Soft delete - set isActive to false
  locations[index].isActive = false;
  locations[index].updatedAt = new Date().toISOString();
  
  saveLocations(locations);
  return true;
}

async function createUserLocationAccess(accessData: any): Promise<UserLocationData> {
  const userLocations = loadUserLocations();
  
  const newUserLocation: UserLocationData = {
    id: userLocationIdCounter++,
    ...accessData,
    isActive: true,
    assignedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  userLocations.push(newUserLocation);
  saveUserLocations(userLocations);
  
  return newUserLocation;
}

async function removeUserLocationAccess(userId: number, locationId: number): Promise<boolean> {
  const userLocations = loadUserLocations();
  const index = userLocations.findIndex(ul => 
    ul.userId === userId && ul.locationId === locationId
  );
  
  if (index === -1) {
    return false;
  }
  
  // Remove the access record
  userLocations.splice(index, 1);
  saveUserLocations(userLocations);
  
  return true;
}

export default router;