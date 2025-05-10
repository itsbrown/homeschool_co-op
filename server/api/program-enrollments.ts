import { Request, Response } from "express";
import { storage } from "../storage";
import { insertProgramEnrollmentSchema } from "@shared/schema";
import { ZodError } from "zod";
import { formatZodError } from "../utils";

// Get all enrollments for a parent's children
export const getMyChildrenEnrollments = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get all of the parent's children
    const children = await storage.getChildrenByParentId(req.session.userId);
    
    if (!children || children.length === 0) {
      return res.json([]);
    }
    
    // Get childIds
    const childIds = children.map(child => child.id);
    
    // Get enrollments for all children
    const enrollments = await storage.getEnrollmentsByChildIds(childIds);
    res.json(enrollments);
  } catch (error: any) {
    console.error("Error fetching enrollments:", error);
    res.status(500).json({ message: "Error fetching enrollments", error: error.message });
  }
};

// Get enrollments for a specific program (instructor only)
export const getProgramEnrollments = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const programId = parseInt(req.params.programId);
    if (isNaN(programId)) {
      return res.status(400).json({ message: "Invalid program ID" });
    }

    // Check if user is the instructor for this program
    const program = await storage.getProgramById(programId);
    
    if (!program) {
      return res.status(404).json({ message: "Program not found" });
    }
    
    // Security check - only allow instructor to access their own program enrollments
    if (program.instructorId !== req.session.userId && req.session.userRole !== 'admin') {
      return res.status(403).json({ message: "Not authorized to access enrollments for this program" });
    }

    const enrollments = await storage.getEnrollmentsByProgramId(programId);
    res.json(enrollments);
  } catch (error: any) {
    console.error("Error fetching program enrollments:", error);
    res.status(500).json({ message: "Error fetching enrollments", error: error.message });
  }
};

// Get a specific enrollment by ID
export const getEnrollmentById = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const enrollmentId = parseInt(req.params.id);
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    
    // Security check - verify user has appropriate access (parent of child or instructor of program)
    const child = await storage.getChildById(enrollment.childId);
    const program = await storage.getProgramById(enrollment.programId);
    
    if (!child || !program) {
      return res.status(404).json({ message: "Associated child or program not found" });
    }
    
    // Check if user is parent of the child or instructor of the program
    const isParent = child.parentId === req.session.userId;
    const isInstructor = program.instructorId === req.session.userId;
    const isAdmin = req.session.userRole === 'admin';
    
    if (!isParent && !isInstructor && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to access this enrollment" });
    }

    res.json(enrollment);
  } catch (error: any) {
    console.error("Error fetching enrollment:", error);
    res.status(500).json({ message: "Error fetching enrollment", error: error.message });
  }
};

// Create a new enrollment for a child in a program
export const createEnrollment = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const validatedData = insertProgramEnrollmentSchema.parse(req.body);
    
    // Verify child belongs to parent
    const child = await storage.getChildById(validatedData.childId);
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    
    if (child.parentId !== req.session.userId && req.session.userRole !== 'admin') {
      return res.status(403).json({ message: "Not authorized to enroll this child" });
    }
    
    // Verify program exists and is published
    const program = await storage.getProgramById(validatedData.programId);
    if (!program) {
      return res.status(404).json({ message: "Program not found" });
    }
    
    if (!program.isPublished && req.session.userId !== program.instructorId && req.session.userRole !== 'admin') {
      return res.status(403).json({ message: "Program is not available for enrollment" });
    }
    
    // Check if program has capacity
    const enrollmentCount = await storage.getEnrollmentCountForProgram(validatedData.programId);
    if (enrollmentCount >= program.capacity) {
      // If program is full, set status to waitlisted automatically
      validatedData.status = "waitlisted";
    }
    
    const enrollment = await storage.createProgramEnrollment(validatedData);
    res.status(201).json(enrollment);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid enrollment data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error creating enrollment:", error);
    res.status(500).json({ message: "Error creating enrollment", error: error.message });
  }
};

// Update an enrollment status (by parent, instructor, or admin)
export const updateEnrollment = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const enrollmentId = parseInt(req.params.id);
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    // First check if enrollment exists
    const existingEnrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!existingEnrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    
    // Security check - verify user has appropriate access
    const child = await storage.getChildById(existingEnrollment.childId);
    const program = await storage.getProgramById(existingEnrollment.programId);
    
    if (!child || !program) {
      return res.status(404).json({ message: "Associated child or program not found" });
    }
    
    // Check if user is parent of the child or instructor of the program
    const isParent = child.parentId === req.session.userId;
    const isInstructor = program.instructorId === req.session.userId;
    const isAdmin = req.session.userRole === 'admin';
    
    if (!isParent && !isInstructor && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to update this enrollment" });
    }
    
    // Parents can only cancel enrollments, not change other statuses
    if (isParent && !isInstructor && !isAdmin) {
      if (req.body.status && req.body.status !== 'cancelled') {
        return res.status(403).json({ message: "Parents can only cancel enrollments" });
      }
    }

    const validatedData = insertProgramEnrollmentSchema.partial().parse(req.body);
    
    const updatedEnrollment = await storage.updateProgramEnrollment(enrollmentId, validatedData);
    res.json(updatedEnrollment);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid enrollment data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error updating enrollment:", error);
    res.status(500).json({ message: "Error updating enrollment", error: error.message });
  }
};

// Delete an enrollment (admin only)
export const deleteEnrollment = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Check if user is admin
    if (req.session.userRole !== 'admin') {
      return res.status(403).json({ message: "Only administrators can delete enrollments" });
    }

    const enrollmentId = parseInt(req.params.id);
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    await storage.deleteProgramEnrollment(enrollmentId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting enrollment:", error);
    res.status(500).json({ message: "Error deleting enrollment", error: error.message });
  }
};