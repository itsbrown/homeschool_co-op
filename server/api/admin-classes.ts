import { Router } from "express";
import { z } from "zod";
import { insertClassSchema } from "@shared/schema";
import { storage } from "../storage";
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireAdmin } from '../middleware/auth0-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

const router = Router();

// Get educators (for assigning to classes)
router.get("/educators", supabaseAuth, requireAdmin, async (req, res) => {
  try {
    // For now, we'll use the test users since we're working without a database
    const educators = [
      { id: 1, name: "Admin User", username: "admin", role: "admin" },
      { id: 2, name: "Educator User", username: "educator", role: "educator" },
      { id: 3, name: "Jane Smith", username: "jsmith", role: "educator" },
      { id: 4, name: "Michael Davis", username: "mdavis", role: "educator" }
    ];

    res.json({ educators });
  } catch (error) {
    console.error("Error fetching educators:", error);
    res.status(500).json({ message: "Failed to fetch educators" });
  }
});

// Get a specific class by ID
router.get("/classes/:id", supabaseAuth, requireAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const classData = await storage.getClassById(id);

    if (!classData) {
      return res.status(404).json({ message: "Class not found" });
    }

    // [FIX:v3.0] Verify class belongs to user's school - schoolId is now string, normalize DB value
    if (String(classData.school_id) !== schoolId) {
      console.log(`Access denied: class school_id=${classData.school_id}, user school_id=${schoolId}`);
      return res.status(403).json({ message: "Not authorized to access classes from other schools" });
    }

    res.json(classData);
  } catch (error) {
    console.error("Error fetching class details:", error);
    res.status(500).json({ message: "Failed to fetch class details" });
  }
});

// Get all classes (with pagination and filters)
router.get("/classes", supabaseAuth, requireAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const status = (req.query.status as string) || "";

    console.log("Using database storage for classes, filtering by school_id:", schoolId);
    
    // Get all classes for this school first, then apply filters
    // storage.getClassesBySchoolId expects string parameter
    const allSchoolClasses = await storage.getClassesBySchoolId(String(schoolId));
    
    // Apply client-side filters (TODO: move to storage layer for better performance)
    let filteredClasses = allSchoolClasses;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredClasses = filteredClasses.filter(c => 
        c.title?.toLowerCase().includes(searchLower) ||
        c.description?.toLowerCase().includes(searchLower)
      );
    }
    if (category) {
      filteredClasses = filteredClasses.filter(c => c.category === category);
    }
    if (status) {
      filteredClasses = filteredClasses.filter(c => c.status === status);
    }
    
    // Apply pagination
    const totalCount = filteredClasses.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const classes = filteredClasses.slice(startIndex, startIndex + limit);

    console.log("FETCHED CLASSES:", JSON.stringify(classes));
    console.log("SENDING RESPONSE:", {
      classes: classes.length,
      totalCount,
      totalPages
    });

    return res.status(200).json({
      classes,
      page,
      limit,
      totalCount,
      totalPages
    });
  } catch (error) {
    console.error("Error fetching classes:", error);
    return res.status(500).json({ message: "Error fetching classes", error: String(error) });
  }
});

// Create a new class
router.post("/classes", supabaseAuth, requireAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    // Validate request body (exclude school_id from client data)
    const { school_id: _, ...bodyWithoutSchoolId } = req.body;
    // [FIX:v3.0] Convert string schoolId to number for schema validation (Drizzle expects integer)
    const validatedData = insertClassSchema.parse({
      ...bodyWithoutSchoolId,
      school_id: Number(schoolId), // Use authenticated user's school ID
    });

    console.log("Creating class with data:", JSON.stringify(validatedData));

    // Get authenticated user's ID
    const user = await storage.getUserByEmail(req.user.email);
    const instructorId = user?.id || 1;
    
    console.log("Using database storage to create class");
    const classItem = await storage.createClass({
      ...validatedData,
      instructorId,
    });

    console.log("Class created successfully:", JSON.stringify(classItem));

    return res.status(201).json(classItem);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.format() 
      });
    }

    console.error("Error creating class:", error);
    return res.status(500).json({ message: "Error creating class", error: String(error) });
  }
});

// Update a class
router.patch("/classes/:id", supabaseAuth, requireAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    // Get existing class using database storage
    const existingClass = await storage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    // [FIX:v3.0] Verify class belongs to user's school - schoolId is now string, normalize DB value
    if (String(existingClass.school_id) !== schoolId) {
      console.log(`Update denied: class school_id=${existingClass.school_id}, user school_id=${schoolId}`);
      return res.status(403).json({ message: "Not authorized to update classes from other schools" });
    }

    // Extract all fields from the request body
    const { 
      subject, 
      gradeLevel, 
      ageRange, 
      schedule,
      ...standardFields
    } = req.body;

    // Partial validation of standard fields (allow partial updates)
    const validatedData = insertClassSchema.partial().parse(standardFields);

    // Always respect the price entered in the form
    if (validatedData.price !== undefined) {
      console.log("Form provided price (dollars):", validatedData.price);
      // Convert to cents if not already
      if (validatedData.price < 10000) {
        console.log("Converting price to cents:", validatedData.price * 100);
        validatedData.price = validatedData.price * 100;
      }
    }

    // Keep dates as strings to prevent timezone issues
    if (validatedData.startDate) {
      validatedData.startDate = String(validatedData.startDate);
    }
    if (validatedData.endDate) {
      validatedData.endDate = String(validatedData.endDate);
    }

    // Add custom fields back
    const updateData = {
      ...validatedData,
      subject,
      gradeLevel,
      ageRange,
      schedule
    };

    // Ensure instructorId is a number if provided
    if (updateData.instructorId) {
      updateData.instructorId = parseInt(updateData.instructorId.toString(), 10);
      console.log("Instructor ID assigned:", updateData.instructorId);
    }

    console.log("Updating class with data:", JSON.stringify(updateData, null, 2));

    console.log("Using database storage to update class");
    const updatedClass = await storage.updateClass(id, updateData);

    console.log("Class updated successfully:", JSON.stringify(updatedClass, null, 2));

    return res.status(200).json(updatedClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.format() 
      });
    }

    console.error("Error updating class:", error);
    return res.status(500).json({ message: "Error updating class" });
  }
});

// Delete a class
router.delete("/classes/:id", supabaseAuth, requireAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const existingClass = await storage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    // [FIX:v3.0] Verify class belongs to user's school - schoolId is now string, normalize DB value
    if (String(existingClass.school_id) !== schoolId) {
      console.log(`Delete denied: class school_id=${existingClass.school_id}, user school_id=${schoolId}`);
      return res.status(403).json({ message: "Not authorized to delete classes from other schools" });
    }

    console.log("Admin user deleting class:", id);

    console.log("Using database storage to delete class");
    await storage.deleteClass(id);

    return res.status(200).json({ message: "Class deleted successfully" });
  } catch (error) {
    console.error("Error deleting class:", error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting class';
    
    // Check if this is a dependency conflict error
    if (errorMessage.includes('Cannot delete class:')) {
      return res.status(409).json({ message: errorMessage });
    }
    
    // For other errors, return 500
    return res.status(500).json({ message: errorMessage });
  }
});

// Handle CSV file upload for classes
router.post("/classes/upload", supabaseAuth, requireAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const file = req.files.file;

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const uploadPath = path.join(uploadsDir, file.name);

    // Save the uploaded file
    await new Promise((resolve, reject) => {
      file.mv(uploadPath, (err) => {
        if (err) reject(err);
        else resolve(null);
      });
    });

    // Read the CSV file
    const csvContent = fs.readFileSync(uploadPath, "utf8");

    // Parse the CSV data
    const { data } = await new Promise((resolve, reject) => {
      parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, data) => {
        if (err) reject(err);
        else resolve({ data });
      });
    });

    // Get authenticated user for instructorId
    const user = await storage.getUserByEmail(req.user.email);
    const instructorId = user?.id || 1;

    // Process each row
    const importedClasses = [];

    for (const row of data) {
      // Map CSV columns to class fields
      const classData = {
        title: row.title || row.className || row.name || "",
        description: row.description || "",
        price: parseFloat(row.price || "0") * 100, // Convert to cents
        gradeLevel: row.gradeLevel || row.grade || "K-12",
        subject: row.subject || "General",
        category: row.category || "General",
        categoryName: row.categoryName || row.category || "General",
        startDate: row.startDate ? new Date(row.startDate) : new Date(),
        endDate: row.endDate ? new Date(row.endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        capacity: parseInt(row.capacity || "20"),
        location: row.location || "Virtual",
        instructorName: row.instructor || "Staff",
        instructorId, // Use authenticated user's ID
        school_id: Number(schoolId), // [FIX:v3.0] Convert string to number for Drizzle schema
        isPublished: true,
        status: row.status || "published",
        productId: row.productId || null,
        totalOrders: parseInt(row.totalOrders || "0"),
        sessionDays: row.sessionDays ? row.sessionDays.split(",").map(day => day.trim()) : ["Monday"],
        programType: row.programType || "class"
      };

      // Validate required fields
      if (!classData.title) {
        continue; // Skip this row
      }

      // Create class using database storage - will be assigned to authenticated user's school
      console.log(`Using database storage to create class from CSV for school_id=${schoolId}`);
      const newClass = await storage.createClass(classData);
      importedClasses.push(newClass);
    }

    // Clean up
    fs.unlinkSync(uploadPath);

    return res.status(200).json({ 
      message: "Classes imported successfully", 
      count: importedClasses.length 
    });
  } catch (error) {
    console.error("Error importing classes:", error);
    return res.status(500).json({ 
      message: "Error importing classes", 
      error: error.message 
    });
  }
});

export default router;