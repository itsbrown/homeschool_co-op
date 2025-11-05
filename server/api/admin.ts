import express from "express";
import { storage } from "../storage";
import { verifyAuth0Token, requireRole } from "../middleware/auth0-auth";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(verifyAuth0Token);
router.use(requireRole(['admin', 'superAdmin']));

// Manual enrollment for admin-only classes
router.post('/manual-enrollment', async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ message: 'Student ID and Class ID are required' });
    }

    // Verify the class exists and is admin-only
    const classItem = await storage.getClassById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (!classItem.isAdminOnly) {
      return res.status(400).json({ message: 'Manual enrollment is only allowed for admin-only classes' });
    }

    // Get child data for parent information
    const child = await storage.getChildById(studentId);
    if (!child) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if student is already enrolled
    const existingEnrollments = await storage.getEnrollmentsByChildId(studentId);
    const alreadyEnrolled = existingEnrollments.some((e: any) => e.programId === classId || e.classId === classId);
    
    if (alreadyEnrolled) {
      return res.status(400).json({ message: 'Student is already enrolled in this class' });
    }

    // Create complete enrollment using factory function
    const enrollmentData = createEnrollmentDataSimple({
      schoolId: child.schoolId || classItem.schoolId || null,
      parentId: child.parentId,
      parentEmail: child.parentEmail || '',
      childId: studentId,
      childName: `${child.firstName} ${child.lastName}`,
      classId: classId,
      className: classItem.title,
      classType: 'school_class',
      totalCost: 0, // No payment required for admin enrollments
      totalPaid: 0,
      remainingBalance: 0,
      depositRequired: 0,
      paymentStatus: 'completed',
      programStartDate: classItem.startDate || new Date(),
      programEndDate: classItem.endDate || new Date(),
      status: 'enrolled'
    });

    const enrollment = await storage.createProgramEnrollment(enrollmentData);

    console.log(`✅ Admin manually enrolled student ${studentId} in class ${classId}`);
    
    res.json({
      message: 'Student enrolled successfully',
      enrollment
    });

  } catch (error) {
    console.error('Error in manual enrollment:', error);
    res.status(500).json({ message: 'Failed to enroll student' });
  }
});

export default router;