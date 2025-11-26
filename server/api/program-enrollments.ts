import { Request, Response } from "express";
import { storage } from "../storage";
import { insertProgramEnrollmentSchema, updateProgramEnrollmentSchema } from "@shared/schema";
import { ZodError } from "zod";
import { formatZodError } from "../utils";
import { MembershipService } from "../services/membership-service";
import { MembershipCheckService } from "../services/membership-check-service";

// Get all enrollments for a parent's children
export const getMyChildrenEnrollments = async (req: any, res: Response) => {
  try {
    // Check multiple possible locations for email in the Auth0 token
    const userEmail = req.user?.email || req.auth?.payload?.email || req.user?.sub;
    
    console.log('📚 Enrollments API - Auth0 user object:', JSON.stringify(req.user, null, 2));
    console.log('📚 Enrollments API - Extracted email:', userEmail);
    
    if (!userEmail) {
      console.log('❌ Enrollments API - No email found in token');
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get all of the parent's children using email instead of session userId
    const children = await storage.getChildrenByParentEmail(userEmail);
    
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
    
    if (!child) {
      return res.status(404).json({ message: "Associated child not found" });
    }
    
    if (!enrollment.programId) {
      return res.status(400).json({ message: "Enrollment has no associated program" });
    }
    
    const program = await storage.getProgramById(enrollment.programId);
    
    if (!program) {
      return res.status(404).json({ message: "Associated program not found" });
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
    
    // Check membership status before allowing enrollment (skip for admins)
    if (program.schoolId && req.session.userRole !== 'admin') {
      const membershipValidation = await MembershipCheckService.validateMembershipForEnrollment(
        child.parentId,
        program.schoolId
      );
      
      if (!membershipValidation.allowed) {
        return res.status(403).json({ 
          message: membershipValidation.reason || "Membership validation failed",
          requiresMembership: true,
          membership: membershipValidation.membership
        });
      }
      
      // Log warning if membership payment due but in grace period
      if (membershipValidation.reason) {
        console.log(`⚠️ Enrollment allowed but membership payment due: ${membershipValidation.reason}`);
      }
    }
    
    // Check if program has capacity
    const enrollmentCount = await storage.getEnrollmentCountForProgram(validatedData.programId);
    if (enrollmentCount >= program.capacity) {
      // If program is full, set status to waitlist automatically
      validatedData.status = "waitlist";
    }
    
    const enrollment = await storage.createProgramEnrollment(validatedData);
    
    // Ensure membership enrollment for this parent and school
    if (program.schoolId) {
      try {
        await MembershipService.ensureMembershipEnrollment(child.parentId, program.schoolId);
      } catch (error) {
        console.error(`⚠️ Failed to create membership enrollment for parent ${child.parentId} at school ${program.schoolId}:`, error);
        // Don't fail the main enrollment if membership creation fails
      }
    }
    
    // Auto-create school_student record if enrollment status is enrolled or completed (check actual enrollment status after creation)
    if (program.schoolId && enrollment.status && ['enrolled', 'completed'].includes(enrollment.status)) {
      try {
        // Check if school_student record already exists for this child AND school (targeted query)
        const existingSchoolStudent = await storage.getSchoolStudentByChildAndSchool(child.id, program.schoolId);
        
        if (!existingSchoolStudent) {
          console.log(`📚 Creating school_student record for child ${child.id} at school ${program.schoolId}`);
          await storage.createSchoolStudent({
            childId: child.id,
            schoolId: program.schoolId,
            grade: child.gradeLevel || 'Unknown',
            status: 'active',
            locationId: null,
            studentId: null,
            notes: null
          });
          console.log(`✅ School student record created for child ${child.id}`);
        }
      } catch (error) {
        console.error(`⚠️ Failed to create school_student record for child ${child.id}:`, error);
        // Don't fail the enrollment if school_student creation fails
      }
    }
    
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
export const updateEnrollment = async (req: any, res: Response) => {
  try {
    // Supabase-only authentication pattern
    const userEmail = req.user?.email;
    
    if (!userEmail) {
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
    
    // Look up the database user by email to get their ID and role
    const dbUser = await storage.getUserByEmail(userEmail);
    if (!dbUser) {
      return res.status(401).json({ message: "User not found in database" });
    }
    
    const userId = dbUser.id;
    const userRole = dbUser.role;
    
    // Security check - verify user has appropriate access
    const child = await storage.getChildById(existingEnrollment.childId);
    const program = existingEnrollment.programId ? await storage.getProgramById(existingEnrollment.programId) : null;
    
    if (!child) {
      return res.status(404).json({ message: "Associated child not found" });
    }
    
    // Check if user is parent of the child or instructor of the program or admin
    const isParent = child.parentId === userId;
    const isInstructor = program?.instructorId === userId;
    const isAdmin = userRole === 'admin' || userRole === 'schoolAdmin';
    
    if (!isParent && !isInstructor && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to update this enrollment" });
    }
    
    // Parents can only cancel enrollments, not change other statuses
    if (isParent && !isInstructor && !isAdmin) {
      if (req.body.status && req.body.status !== 'cancelled') {
        return res.status(403).json({ message: "Parents can only cancel enrollments" });
      }
    }

    const validatedData = updateProgramEnrollmentSchema.parse(req.body);
    
    // Check if this is a promotion from waitlist
    const wasWaitlisted = existingEnrollment.status === 'waitlist';
    const isBeingPromoted = wasWaitlisted && validatedData.status && validatedData.status !== 'waitlist';
    
    const updatedEnrollment = await storage.updateProgramEnrollment(enrollmentId, validatedData);
    
    // If update failed, return error
    if (!updatedEnrollment) {
      return res.status(500).json({ message: "Failed to update enrollment" });
    }
    
    // Auto-create school_student record if enrollment status is or became enrolled/completed (check both new and existing status)
    const finalStatus = updatedEnrollment.status || existingEnrollment.status;
    const schoolId = existingEnrollment.schoolId || program?.schoolId;
    if (schoolId && ['enrolled', 'completed'].includes(finalStatus)) {
      try {
        // Check if school_student record already exists for this child AND school (targeted query)
        const existingSchoolStudent = await storage.getSchoolStudentByChildAndSchool(child.id, schoolId);
        
        if (!existingSchoolStudent) {
          console.log(`📚 Creating school_student record for child ${child.id} at school ${schoolId} (status: ${finalStatus})`);
          await storage.createSchoolStudent({
            childId: child.id,
            schoolId: schoolId,
            grade: child.gradeLevel || 'Unknown',
            status: 'active',
            locationId: null,
            studentId: null,
            notes: null
          });
          console.log(`✅ School student record created for child ${child.id}`);
        }
      } catch (error) {
        console.error(`⚠️ Failed to create school_student record for child ${child.id}:`, error);
        // Don't fail the enrollment update if school_student creation fails
      }
    }
    
    // If student was promoted from waitlist, recalculate positions for remaining students
    if (isBeingPromoted && existingEnrollment.programId) {
      try {
        // Get all waitlisted enrollments for this program
        const allEnrollments = await storage.getEnrollmentsByProgramId(existingEnrollment.programId);
        const waitlistedEnrollments = allEnrollments
          .filter((e: any) => e.status === 'waitlist' && e.id !== enrollmentId)
          .sort((a: any, b: any) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));
        
        // Update positions for remaining waitlisted students
        for (let i = 0; i < waitlistedEnrollments.length; i++) {
          const student = waitlistedEnrollments[i];
          await storage.updateProgramEnrollment(student.id, { waitlistPosition: i + 1 });
        }
        
        console.log(`✅ Recalculated waitlist positions after manual promotion (${waitlistedEnrollments.length} students remaining)`);
      } catch (error) {
        console.error('Error recalculating waitlist positions after promotion:', error);
        // Don't fail the main update if position recalculation fails
      }
    }
    
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