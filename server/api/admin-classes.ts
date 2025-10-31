import { Router } from "express";
import { z } from "zod";
import { insertClassSchema } from "@shared/schema";
import { storage } from "../storage";
import { verifyAuth0Token, requireAdmin } from '../middleware/auth0-auth';
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

const router = Router();

// Get educators (for assigning to classes)
router.get("/educators", verifyAuth0Token, requireAdmin, async (req, res) => {
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

// Get a specific class by ID (first instance)
router.get("/classes/:id", verifyAuth0Token, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const classData = await storage.getClassById(id);

    if (!classData) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json(classData);
  } catch (error) {
    console.error("Error fetching class details:", error);
    res.status(500).json({ message: "Failed to fetch class details" });
  }
});

// Get all classes (with pagination and filters)
router.get("/classes", verifyAuth0Token, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const status = (req.query.status as string) || "";

    console.log("Using database storage for classes");
    const classes = await storage.getClasses({
      page,
      limit,
      search,
      category,
      status,
    });
    const totalCount = await storage.getClassesCount({ search, category, status });
    const totalPages = Math.ceil(totalCount / limit);

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
router.post("/classes", verifyAuth0Token, requireAdmin, async (req, res) => {
  try {
    // Validate request body
    const validatedData = insertClassSchema.parse(req.body);

    console.log("Creating class with data:", JSON.stringify(validatedData));

    const instructorId = req.session.userId || 1;
    
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
router.patch("/classes/:id", verifyAuth0Token, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // Get existing class using database storage
    const existingClass = await storage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    // For admin users, allow updating any class regardless of instructor
    const userRole = req.session.userRole;
    if (userRole !== 'admin') {
      const userId = req.session.userId || 1;
      if (existingClass.instructorId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this class" });
      }
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
router.delete("/classes/:id", verifyAuth0Token, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const existingClass = await storage.getClassById(id);
    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" });
    }

    console.log("Admin user deleting class:", id);

    console.log("Using database storage to delete class");
    await storage.deleteClass(id);

    return res.status(200).json({ message: "Class deleted successfully" });
  } catch (error) {
    console.error("Error deleting class:", error);
    return res.status(500).json({ message: "Error deleting class", error: String(error) });
  }
});

// Handle CSV file upload for classes
router.post("/classes/upload", verifyAuth0Token, requireAdmin, async (req, res) => {
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

      // Create class using database storage
      console.log("Using database storage to create class from CSV");
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