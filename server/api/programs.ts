import { Request, Response } from "express";
import { storage } from "../storage";
import { insertProgramSchema } from "@shared/schema";
import { ZodError } from "zod";
import { formatZodError } from "../utils";

// Get all published programs (public endpoint)
export const getPublishedPrograms = async (req: Request, res: Response) => {
  try {
    // Optional query parameters
    const category = req.query.category as string | undefined;
    const gradeLevel = req.query.gradeLevel as string | undefined;
    
    const programs = await storage.getPublishedPrograms(category, gradeLevel);
    res.json(programs);
  } catch (error: any) {
    console.error("Error fetching published programs:", error);
    res.status(500).json({ message: "Error fetching programs", error: error.message });
  }
};

// Get a specific program by ID (only published programs for non-instructors)
export const getProgramById = async (req: Request, res: Response) => {
  try {
    const programId = parseInt(req.params.id);
    if (isNaN(programId)) {
      return res.status(400).json({ message: "Invalid program ID" });
    }

    const program = await storage.getProgramById(programId);
    
    if (!program) {
      return res.status(404).json({ message: "Program not found" });
    }
    
    // If program is not published, only allow instructor to access it
    if (!program.isPublished && program.instructorId !== req.session?.userId) {
      return res.status(403).json({ message: "Not authorized to access this program" });
    }

    res.json(program);
  } catch (error: any) {
    console.error("Error fetching program:", error);
    res.status(500).json({ message: "Error fetching program", error: error.message });
  }
};

// Get programs created by the current user (instructor)
export const getMyPrograms = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const programs = await storage.getProgramsByInstructorId(req.session.userId);
    res.json(programs);
  } catch (error: any) {
    console.error("Error fetching instructor programs:", error);
    res.status(500).json({ message: "Error fetching programs", error: error.message });
  }
};

// Create a new program (instructors only)
export const createProgram = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Check user role (optional, already implemented in routes with hasRole middleware)
    const userRole = req.session.userRole;
    if (userRole !== 'educator' && userRole !== 'admin') {
      return res.status(403).json({ message: "Only educators can create programs" });
    }

    const validatedData = insertProgramSchema.parse(req.body);
    
    const program = await storage.createProgram({
      ...validatedData,
      instructorId: req.session.userId
    });

    res.status(201).json(program);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid program data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error creating program:", error);
    res.status(500).json({ message: "Error creating program", error: error.message });
  }
};

// Update an existing program (only if user is the instructor)
export const updateProgram = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const programId = parseInt(req.params.id);
    if (isNaN(programId)) {
      return res.status(400).json({ message: "Invalid program ID" });
    }

    // First check if program exists and belongs to instructor
    const existingProgram = await storage.getProgramById(programId);
    if (!existingProgram) {
      return res.status(404).json({ message: "Program not found" });
    }
    
    // Security check - only allow instructor to update their own programs
    if (existingProgram.instructorId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to update this program" });
    }

    const validatedData = insertProgramSchema.partial().parse(req.body);
    
    const updatedProgram = await storage.updateProgram(programId, validatedData);
    res.json(updatedProgram);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid program data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error updating program:", error);
    res.status(500).json({ message: "Error updating program", error: error.message });
  }
};

// Delete a program (only if user is the instructor)
export const deleteProgram = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const programId = parseInt(req.params.id);
    if (isNaN(programId)) {
      return res.status(400).json({ message: "Invalid program ID" });
    }

    // First check if program exists and belongs to instructor
    const existingProgram = await storage.getProgramById(programId);
    if (!existingProgram) {
      return res.status(404).json({ message: "Program not found" });
    }
    
    // Security check - only allow instructor to delete their own programs
    if (existingProgram.instructorId !== req.session.userId && req.session.userRole !== 'admin') {
      return res.status(403).json({ message: "Not authorized to delete this program" });
    }

    await storage.deleteProgram(programId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting program:", error);
    res.status(500).json({ message: "Error deleting program", error: error.message });
  }
};