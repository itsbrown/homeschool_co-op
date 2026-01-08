import express from "express";
import { z } from "zod";
import { insertLocationSchema, insertUserLocationSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireSchoolContext } from "../middleware/require-school-context";
import { 
  updateParentLocation, 
  getParentLocationInfo,
  getLocationsBySchoolId as getLocationsService,
  LocationSyncContext
} from "../services/locationSyncService";

const router = express.Router();

// ROUTE ORDER MATTERS: Static paths must come before parameterized paths
// to prevent Express from treating "accessible" as an ID

// PUBLIC: Get locations for a school (no authentication required)
// Used by registration form before user logs in
router.get("/public", async (req, res) => {
  try {
    const schoolIdParam = req.query.schoolId;
    
    if (!schoolIdParam) {
      return res.status(400).json({ message: "School ID is required" });
    }
    
    // Validate schoolId is a valid number
    const schoolId = parseInt(String(schoolIdParam), 10);
    if (isNaN(schoolId) || schoolId <= 0) {
      return res.status(400).json({ message: "Invalid school ID - must be a positive number" });
    }
    
    console.log('🏢 [PUBLIC] Fetching locations for school ID:', schoolId);
    const locations = await storage.getLocationsBySchoolId(schoolId);
    console.log('✅ [PUBLIC] Found locations:', locations.length);
    
    // Return only public information (id and name) - no sensitive data
    const publicLocations = locations.map(loc => ({
      id: loc.id,
      name: loc.name
    }));
    
    res.json(publicLocations);
  } catch (error) {
    console.error("Error fetching public locations:", error);
    res.status(500).json({ message: "Failed to fetch locations" });
  }
});

// Get all locations for a school
router.get("/", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database (string)
    const authenticatedSchoolId = req.schoolId;
    
    // If a query parameter is provided, validate it matches the authenticated school
    if (req.query.schoolId) {
      const requestedSchoolId = String(req.query.schoolId);
      
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
    // [FIX:v3.0] Get all locations for the school from database - convert string to number for storage
    const locations = await storage.getLocationsBySchoolId(Number(schoolId));
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
    
    // [FIX:v3.0] Normalize DB value for comparison - schoolId is now string
    if (String(user.schoolId) !== authenticatedSchoolId) {
      console.warn(`🚨 Security: User from school ${authenticatedSchoolId} attempted to access locations for user ${userId} from school ${user.schoolId}`);
      return res.status(403).json({ 
        message: "Access denied - this user belongs to a different school" 
      });
    }

    // Get locations the user has access to from database
    const accessibleLocations = await storage.getUserAccessibleLocations(userId);
    
    // [FIX:v3.0] SECURITY: Filter to only locations belonging to authenticated user's school (defense in depth)
    // Normalize DB schoolId values for comparison - schoolId is now string
    const schoolFilteredLocations = accessibleLocations.filter(
      location => String(location.schoolId) === authenticatedSchoolId
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
    
    // [FIX:v3.0] SECURITY: Verify location belongs to authenticated user's school
    // Normalize DB value for comparison - schoolId is now string
    if (String(location.schoolId) !== authenticatedSchoolId) {
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
    
    // [FIX:v3.0] SECURITY: Use the authenticated user's schoolId from database, ignoring client-provided value
    const validatedData = insertLocationSchema.parse(req.body);
    const locationData = {
      ...validatedData,
      schoolId: Number(schoolId)  // Convert string to number for Drizzle integer column
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
    
    // [FIX:v3.0] SECURITY: Verify location belongs to authenticated user's school
    // Normalize DB value for comparison - schoolId is now string
    if (String(existingLocation.schoolId) !== authenticatedSchoolId) {
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
    
    // [FIX:v3.0] SECURITY: Verify location belongs to authenticated user's school
    // Normalize DB value for comparison - schoolId is now string
    if (String(existingLocation.schoolId) !== authenticatedSchoolId) {
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
    
    // [FIX:v3.0] Normalize DB values for comparison - schoolId is now string
    if (String(location.schoolId) !== authenticatedSchoolId) {
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
    
    // [FIX:v3.0] Normalize DB value for comparison - schoolId is now string
    if (String(user.schoolId) !== authenticatedSchoolId) {
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
router.delete("/access/:userId/:locationId", requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const authenticatedSchoolId = req.schoolId;
    
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

// ============================================================================
// PARENT LOCATION ENDPOINTS (self-service and admin)
// ============================================================================

// Get current user's location info (self-service)
router.get("/my-location", requireSchoolContext, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const locationInfo = await getParentLocationInfo(userId);
    if (!locationInfo) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(locationInfo);
  } catch (error) {
    console.error("Error fetching user location:", error);
    res.status(500).json({ message: "Failed to fetch location" });
  }
});

// Update current user's location (parent self-service)
router.patch("/my-location", requireSchoolContext, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const schoolId = Number(req.schoolId);
    
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const schema = z.object({
      locationId: z.number().nullable()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid request body",
        errors: parsed.error.errors 
      });
    }

    const { locationId } = parsed.data;

    const context: LocationSyncContext = {
      actorId: userId,
      actorEmail: userEmail || 'unknown',
      actorRole: req.user?.role || 'parent',
      schoolId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    const result = await updateParentLocation(userId, locationId, context);

    if (!result.success) {
      return res.status(400).json({ 
        message: result.error || "Failed to update location" 
      });
    }

    res.json({
      message: "Location updated successfully",
      parentUpdated: result.parentUpdated,
      childrenUpdated: result.childrenUpdated
    });
  } catch (error) {
    console.error("Error updating user location:", error);
    res.status(500).json({ message: "Failed to update location" });
  }
});

// Admin: Update a parent's location (requires canManageStudents permission)
router.patch("/parent/:parentId/location", requireSchoolContext, async (req: any, res) => {
  try {
    const adminId = req.user?.id;
    const adminEmail = req.user?.email;
    const schoolId = Number(req.schoolId);
    const parentId = parseInt(req.params.parentId);

    if (!adminId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (isNaN(parentId)) {
      return res.status(400).json({ message: "Invalid parent ID" });
    }

    // Check admin permissions - must have canManageStudents
    const userLocations = await storage.getUserLocationsByUserId(adminId);
    const hasManageStudentsPermission = userLocations.some(
      (ul: any) => ul.canManageStudents === true
    );

    // Also allow schoolAdmin role
    const isSchoolAdmin = req.user?.role === 'schoolAdmin' || req.user?.role === 'admin';

    if (!hasManageStudentsPermission && !isSchoolAdmin) {
      return res.status(403).json({ 
        message: "Permission denied - canManageStudents permission required" 
      });
    }

    // Verify parent belongs to the same school
    const parentUser = await storage.getUser(parentId);
    if (!parentUser) {
      return res.status(404).json({ message: "Parent not found" });
    }

    if (Number(parentUser.schoolId) !== schoolId) {
      return res.status(403).json({ 
        message: "Access denied - parent belongs to a different school" 
      });
    }

    const schema = z.object({
      locationId: z.number().nullable()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid request body",
        errors: parsed.error.errors 
      });
    }

    const { locationId } = parsed.data;

    const context: LocationSyncContext = {
      actorId: adminId,
      actorEmail: adminEmail || 'unknown',
      actorRole: req.user?.role || 'schoolAdmin',
      schoolId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    const result = await updateParentLocation(parentId, locationId, context);

    if (!result.success) {
      return res.status(400).json({ 
        message: result.error || "Failed to update location" 
      });
    }

    res.json({
      message: "Parent location updated successfully",
      parentUpdated: result.parentUpdated,
      childrenUpdated: result.childrenUpdated
    });
  } catch (error) {
    console.error("Error updating parent location:", error);
    res.status(500).json({ message: "Failed to update parent location" });
  }
});

// Admin: Get a parent's location info
router.get("/parent/:parentId/location", requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = Number(req.schoolId);
    const parentId = parseInt(req.params.parentId);

    if (isNaN(parentId)) {
      return res.status(400).json({ message: "Invalid parent ID" });
    }

    // Verify parent belongs to the same school
    const parentUser = await storage.getUser(parentId);
    if (!parentUser) {
      return res.status(404).json({ message: "Parent not found" });
    }

    if (Number(parentUser.schoolId) !== schoolId) {
      return res.status(403).json({ 
        message: "Access denied - parent belongs to a different school" 
      });
    }

    const locationInfo = await getParentLocationInfo(parentId);
    res.json(locationInfo);
  } catch (error) {
    console.error("Error fetching parent location:", error);
    res.status(500).json({ message: "Failed to fetch parent location" });
  }
});

// ============================================================================
// LOCATION-BASED REPORTING ENDPOINTS
// ============================================================================

// Get students by location
router.get("/reports/students-by-location", requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = Number(req.schoolId);
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : null;

    // Validate locationId belongs to this school if provided
    if (locationId) {
      const location = await storage.getLocationById(locationId);
      if (!location || Number(location.schoolId) !== schoolId) {
        return res.status(403).json({ message: "Access denied - location belongs to a different school" });
      }
    }

    // Get all school students for this school (storage already filters by schoolId)
    const schoolStudents = await storage.getSchoolStudentsBySchoolId(schoolId);
    
    // Double-check tenant isolation (defense in depth)
    const tenantFilteredStudents = schoolStudents.filter((s: any) => Number(s.schoolId) === schoolId);
    
    // Filter by location if provided
    const filtered = locationId 
      ? tenantFilteredStudents.filter((s: any) => s.locationId === locationId)
      : tenantFilteredStudents;

    // Group by location
    const byLocation: Record<string, any[]> = {};
    for (const student of filtered) {
      const locId = student.locationId ? String(student.locationId) : 'unassigned';
      if (!byLocation[locId]) {
        byLocation[locId] = [];
      }
      byLocation[locId].push(student);
    }

    res.json({
      total: filtered.length,
      byLocation,
      students: filtered
    });
  } catch (error) {
    console.error("Error fetching students by location:", error);
    res.status(500).json({ message: "Failed to fetch students by location" });
  }
});

// Get families (parents) by location
router.get("/reports/families-by-location", requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = Number(req.schoolId);
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : null;

    // Validate locationId belongs to this school if provided
    if (locationId) {
      const location = await storage.getLocationById(locationId);
      if (!location || Number(location.schoolId) !== schoolId) {
        return res.status(403).json({ message: "Access denied - location belongs to a different school" });
      }
    }

    // Get all users for this school who are parents (with strict tenant filtering)
    const allUsers = await storage.getAllUsers();
    const schoolParents = allUsers.filter((u: any) => 
      Number(u.schoolId) === schoolId && u.role === 'parent'
    );

    // Filter by location if provided
    const filtered = locationId
      ? schoolParents.filter((p: any) => p.locationId === locationId)
      : schoolParents;

    // Group by location (return only safe fields - no PII unless needed)
    const byLocation: Record<string, any[]> = {};
    for (const parent of filtered) {
      const locId = parent.locationId ? String(parent.locationId) : 'unassigned';
      if (!byLocation[locId]) {
        byLocation[locId] = [];
      }
      byLocation[locId].push({
        id: parent.id,
        name: parent.name,
        email: parent.email,
        locationId: parent.locationId
      });
    }

    res.json({
      total: filtered.length,
      byLocation,
      families: filtered.map((p: any) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        locationId: p.locationId
      }))
    });
  } catch (error) {
    console.error("Error fetching families by location:", error);
    res.status(500).json({ message: "Failed to fetch families by location" });
  }
});

// Get location summary statistics
router.get("/reports/summary", requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = Number(req.schoolId);

    // Get all locations for this school (with tenant isolation)
    const allLocations = await storage.getLocationsBySchoolId(schoolId);
    const locations = allLocations.filter((loc: any) => Number(loc.schoolId) === schoolId);
    
    // Get all school students (with tenant isolation)
    const allSchoolStudents = await storage.getSchoolStudentsBySchoolId(schoolId);
    const schoolStudents = allSchoolStudents.filter((s: any) => Number(s.schoolId) === schoolId);
    
    // Get all parents in this school (with strict tenant filtering)
    const allUsers = await storage.getAllUsers();
    const schoolParents = allUsers.filter((u: any) => 
      Number(u.schoolId) === schoolId && u.role === 'parent'
    );

    // Build summary
    const summary = locations.map((loc: any) => {
      const studentCount = schoolStudents.filter((s: any) => s.locationId === loc.id).length;
      const familyCount = schoolParents.filter((p: any) => p.locationId === loc.id).length;
      
      return {
        locationId: loc.id,
        locationName: loc.name,
        locationCode: loc.code,
        studentCount,
        familyCount,
        isActive: loc.isActive
      };
    });

    // Add unassigned counts
    const unassignedStudents = schoolStudents.filter((s: any) => !s.locationId).length;
    const unassignedFamilies = schoolParents.filter((p: any) => !p.locationId).length;

    res.json({
      locations: summary,
      unassigned: {
        studentCount: unassignedStudents,
        familyCount: unassignedFamilies
      },
      totals: {
        locationCount: locations.length,
        totalStudents: schoolStudents.length,
        totalFamilies: schoolParents.length
      }
    });
  } catch (error) {
    console.error("Error fetching location summary:", error);
    res.status(500).json({ message: "Failed to fetch location summary" });
  }
});

export default router;