import express from "express";
import { storage } from "../storage";
import { verifyAuth0Token, requireRole } from "../middleware/auth0-auth";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";

const router = express.Router();

// All routes require authentication
router.use(verifyAuth0Token);

// Manual enrollment for any class (admin/schoolAdmin can bypass cart/checkout)
// This route is defined BEFORE the admin-only middleware to allow schoolAdmin access
router.post('/manual-enrollment', requireRole(['admin', 'superAdmin', 'schoolAdmin']), async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ message: 'Student ID and Class ID are required' });
    }

    // Verify the class exists
    const classItem = await storage.getClassById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get child data for parent information
    const child = await storage.getChildById(studentId);
    if (!child) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if student is already enrolled - check all class ID fields with type coercion
    const existingEnrollments = await storage.getEnrollmentsByChildId(studentId);
    const classIdNum = typeof classId === 'string' ? parseInt(classId, 10) : classId;
    const alreadyEnrolled = existingEnrollments.some((e: any) => {
      const enrollmentProgramId = typeof e.programId === 'string' ? parseInt(e.programId, 10) : e.programId;
      const enrollmentClassId = typeof e.classId === 'string' ? parseInt(e.classId, 10) : e.classId;
      const enrollmentMarketplaceClassId = typeof e.marketplaceClassId === 'string' ? parseInt(e.marketplaceClassId, 10) : e.marketplaceClassId;
      
      // Check all possible class ID fields and exclude cancelled/withdrawn enrollments
      const isActiveEnrollment = e.status !== 'cancelled' && e.status !== 'withdrawn';
      const matchesClass = enrollmentProgramId === classIdNum || 
                          enrollmentClassId === classIdNum || 
                          enrollmentMarketplaceClassId === classIdNum;
      
      return isActiveEnrollment && matchesClass;
    });
    
    if (alreadyEnrolled) {
      return res.status(400).json({ message: 'Student is already enrolled in this class' });
    }

    // Get class price (already in cents from database)
    const classCost = classItem.price || 0;
    
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
      totalCost: classCost,
      totalPaid: 0,
      remainingBalance: classCost,
      depositRequired: 0,
      paymentStatus: classCost > 0 ? 'pending' : 'completed',
      programStartDate: classItem.startDate || new Date(),
      programEndDate: classItem.endDate || new Date(),
      status: classCost > 0 ? 'pending_payment' : 'enrolled'
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

// Apply strict admin-only middleware for all remaining routes
router.use(requireRole(['admin', 'superAdmin']));

// Add any other admin-only routes below this line

export default router;
