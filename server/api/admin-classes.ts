import { Router } from "express";
import { z } from "zod";
import { insertClassSchema } from "@shared/schema";
import { storage } from "../storage";
import { isAdmin, isAuthenticated } from "../middleware/auth";
// Import both storage options for classes
import { classStorage } from "../class-storage";
import * as classesDb from "../classes-db";

// Flag to track which storage system we're using
let useFileStorage = true;

// Function to determine which storage to use
const getStorage = async () => {
  try {
    // Try to get a class from the database
    await classesDb.getClassById(1);
    // If successful, use database storage
    useFileStorage = false;
    return { useFileStorage };
  } catch (err) {
    // If error, use file storage
    useFileStorage = true;
    return { useFileStorage };
  }
};
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

const router = Router();

// Get all classes (with pagination and filters)
router.get("/classes", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const status = (req.query.status as string) || "";

    // Determine which storage system to use
    await getStorage();
    
    let classes = [];
    let totalCount = 0;
    let totalPages = 0;

    if (useFileStorage) {
      // Use the dedicated file-based class storage implementation
      console.log("Using file-based storage for classes");
      const result = classStorage.getClasses({
        page,
        limit,
        search,
        category,
        status
      });
      
      classes = result.classes;
      totalCount = result.totalCount;
      totalPages = result.totalPages;
    } else {
      // Use database storage if available
      console.log("Using database storage for classes");
      try {
        classes = await classesDb.getClasses({
          page,
          limit,
          search,
          category,
          status,
        });
        totalCount = await classesDb.getClassesCount({ search, category, status });
        totalPages = Math.ceil(totalCount / limit);
      } catch (dbError) {
        console.error("Database operation failed, falling back to file storage:", dbError);
        
        // Fall back to file storage if database operation fails
        const result = classStorage.getClasses({
          page,
          limit,
          search,
          category,
          status
        });
        
        classes = result.classes;
        totalCount = result.totalCount;
        totalPages = result.totalPages;
      }
    }
    
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

// Get a specific class by ID
router.get("/classes/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    const classItem = classStorage.getClassById(id);
    if (!classItem) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    return res.status(200).json(classItem);
  } catch (error) {
    console.error("Error fetching class:", error);
    return res.status(500).json({ message: "Error fetching class" });
  }
});

// Create a new class
router.post("/classes", isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Validate request body
    const validatedData = insertClassSchema.parse(req.body);
    
    console.log("Creating class with data:", JSON.stringify(validatedData));
    
    // Determine which storage system to use
    await getStorage();
    
    let classItem;
    const instructorId = req.session.userId || 1;
    
    if (useFileStorage) {
      // Create class using direct file storage
      console.log("Using file-based storage to create class");
      classItem = classStorage.createClass({
        ...validatedData,
        instructorId,
      });
    } else {
      // Try to use database storage
      console.log("Using database storage to create class");
      try {
        classItem = await classesDb.createClass({
          ...validatedData,
          instructorId,
        });
      } catch (dbError) {
        console.error("Database operation failed, falling back to file storage:", dbError);
        
        // Fall back to file storage
        classItem = classStorage.createClass({
          ...validatedData,
          instructorId,
        });
      }
    }
    
    console.log("Class created successfully:", JSON.stringify(classItem));
    
    // Log current classes in storage for debugging
    const { classes } = classStorage.getClasses({
      page: 1,
      limit: 100,
      search: "",
      category: "",
      status: ""
    });
    console.log("All classes after creation:", JSON.stringify(classes));
    
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
router.patch("/classes/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    // Get existing class using the file-based storage
    const existingClass = classStorage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    // Check if user is authorized to update this class
    // Use default value of 1 if userId is not available
    const userId = req.session.userId || 1;
    if (existingClass.instructorId !== userId) {
      return res.status(403).json({ message: "Not authorized to update this class" });
    }
    
    // Partial validation of request body (allow partial updates)
    const validatedData = insertClassSchema.partial().parse(req.body);
    
    // Update class using file-based storage
    const updatedClass = classStorage.updateClass(id, validatedData);
    
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
router.delete("/classes/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    // Get existing class using file-based storage
    const existingClass = classStorage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    // Check if user is authorized to delete this class
    // Use default value of 1 if userId is not available
    const userId = req.session.userId || 1;
    if (existingClass.instructorId !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this class" });
    }
    
    // Delete class using file-based storage
    classStorage.deleteClass(id);
    
    return res.status(200).json({ message: "Class deleted successfully" });
  } catch (error) {
    console.error("Error deleting class:", error);
    return res.status(500).json({ message: "Error deleting class" });
  }
});

// Handle CSV file upload for classes
router.post("/classes/upload", isAuthenticated, isAdmin, async (req, res) => {
  try {
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
        instructorId: req.session.userId!,
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
      
      // Create the class
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