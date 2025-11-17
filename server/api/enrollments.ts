import express from "express";
import { storage } from "../storage";
import { getDb } from "../db";
import { programEnrollments } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";

const router = express.Router();

// Get enrollments for a specific child
router.get('/child/:childId', async (req, res) => {
  try {
    // Handle special case for "register" route
    if (req.params.childId === 'register') {
      console.log('📚 Register route accessed - returning empty enrollments');
      return res.json([]);
    }
    
    const childId = parseInt(req.params.childId);
    
    if (isNaN(childId)) {
      return res.status(400).json({ message: 'Invalid child ID' });
    }

    console.log(`📚 Fetching enrollments for child ID: ${childId}`);
    
    // Get enrollments for this child
    const enrollments = await storage.getEnrollmentsByChildId(childId);
    
    console.log(`📚 Found ${enrollments.length} enrollments for child ${childId}:`, enrollments);
    
    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching child enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

// Unenroll endpoint - specifically for pending_payment enrollments
router.delete('/:enrollmentId/unenroll', async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`📝 UNENROLLMENT REQUEST: Enrollment ${enrollmentId}`);

    // Get the enrollment to verify it exists and check status
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Only allow unenrollment if payment is pending (not yet paid)
    if (enrollment.status !== 'pending_payment') {
      return res.status(400).json({ 
        message: 'Cannot unenroll from a class that has already been paid for' 
      });
    }

    // Delete the enrollment
    await storage.deleteProgramEnrollment(enrollmentId);

    console.log(`✅ Successfully unenrolled from class: ${enrollment.className}`);
    
    res.json({ 
      message: 'Unenrollment successful',
      enrollmentId: enrollmentId
    });
  } catch (error) {
    console.error('Error unenrolling from class:', error);
    res.status(500).json({ message: 'Failed to unenroll from class' });
  }
});

// Unenroll a child from a class (legacy endpoint)
router.delete('/:enrollmentId', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`❌ Unenrolling enrollment ID: ${enrollmentId}`);

    // Get the enrollment first to verify ownership
    const allEnrollments = await storage.getAllEnrollments();
    const enrollmentToRemove = allEnrollments.find((e: any) => e.id === enrollmentId);
    
    if (!enrollmentToRemove) {
      console.log(`❌ Enrollment ${enrollmentId} not found`);
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // For now, allow any authenticated request to remove enrollments
    // In production, you would verify the user is the parent of the child
    console.log(`📝 Found enrollment to remove:`, enrollmentToRemove);
    
    // Remove the enrollment
    const success = await storage.removeEnrollment(enrollmentId);
    
    if (success) {
      console.log(`✅ Successfully unenrolled enrollment ID: ${enrollmentId}`);
      res.json({ message: 'Unenrollment successful' });
    } else {
      console.log(`❌ Failed to remove enrollment ID: ${enrollmentId}`);
      res.status(404).json({ message: 'Enrollment not found' });
    }
  } catch (error) {
    console.error('Error removing enrollment:', error);
    res.status(500).json({ message: 'Failed to unenroll' });
  }
});

// Bulk cancel multiple enrollments (for cart clear)
router.post('/cancel-multiple', async (req: any, res) => {
  try {
    const { enrollmentIds } = req.body;
    
    // Validate input
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ 
        error: 'enrollmentIds must be a non-empty array' 
      });
    }

    // Get authenticated user email
    const userEmail = req.auth?.email || req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🧹 BULK CANCEL REQUEST from ${userEmail}: ${enrollmentIds.length} enrollments`, enrollmentIds);

    // Get user's children to verify ownership
    const userChildren = await storage.getChildrenByParentEmail(userEmail);
    const userChildIds = userChildren.map((child: any) => child.id);
    
    if (userChildIds.length === 0) {
      return res.status(403).json({ 
        error: 'No children found for this parent' 
      });
    }

    console.log(`👨‍👩‍👧‍👦 Parent ${userEmail} has ${userChildIds.length} children:`, userChildIds);

    // Phase 1: Validate ALL enrollments before cancelling ANY (fail-fast for atomicity)
    const enrollmentsToCancel: Array<{ id: number; enrollment: any }> = [];
    
    for (const enrollmentId of enrollmentIds) {
      const id = parseInt(enrollmentId);
      
      if (isNaN(id)) {
        return res.status(400).json({ 
          error: `Invalid enrollment ID: ${enrollmentId}`,
          failedEnrollmentId: enrollmentId
        });
      }

      // Get the enrollment to verify it exists
      const enrollment = await storage.getProgramEnrollmentById(id);
      
      if (!enrollment) {
        return res.status(404).json({ 
          error: `Enrollment ${id} not found`,
          failedEnrollmentId: id
        });
      }

      // SECURITY: Verify the enrollment belongs to one of the parent's children
      if (!userChildIds.includes(enrollment.childId)) {
        console.error(`🚨 SECURITY: User ${userEmail} attempted to cancel enrollment ${id} for child ${enrollment.childId} they don't own`);
        return res.status(403).json({ 
          error: 'Unauthorized: You can only cancel enrollments for your own children',
          failedEnrollmentId: id
        });
      }

      // Only allow cancellation if payment is pending (not yet paid)
      if (enrollment.status !== 'pending_payment') {
        return res.status(400).json({ 
          error: `Cannot cancel ${enrollment.status} enrollment. Only pending_payment enrollments can be cancelled.`,
          failedEnrollmentId: id,
          enrollmentStatus: enrollment.status
        });
      }

      // Valid for cancellation
      enrollmentsToCancel.push({ id, enrollment });
    }

    // Phase 2: All validations passed - cancel all enrollments using SINGLE atomic database operation
    console.log(`✅ All validations passed for ${enrollmentsToCancel.length} enrollments, proceeding with ATOMIC cancellation`);
    
    try {
      // Get database instance for transaction
      const db = await getDb();
      
      // Collect all IDs to delete
      const idsToDelete = enrollmentsToCancel.map(e => e.id);
      
      // Execute SINGLE delete operation within transaction (truly atomic)
      await db.transaction(async (tx: any) => {
        // Delete all enrollments in a SINGLE query (atomic operation)
        const result = await tx
          .delete(programEnrollments)
          .where(inArray(programEnrollments.id, idsToDelete))
          .returning({ id: programEnrollments.id });
        
        // Verify all rows were deleted
        if (result.length !== idsToDelete.length) {
          throw new Error(
            `Transaction failed: Expected to delete ${idsToDelete.length} enrollments but only deleted ${result.length}. Rolling back.`
          );
        }
        
        console.log(`✅ Atomically deleted ${result.length} enrollments in single operation:`, result.map(r => r.id));
      });
      
      // Transaction committed successfully - all enrollments cancelled
      const response = {
        success: true,
        cancelled: idsToDelete,
        summary: {
          total: enrollmentIds.length,
          cancelled: idsToDelete.length
        }
      };

      console.log(`🧹 ATOMIC BULK CANCEL COMPLETE:`, response.summary);
      return res.json(response);
      
    } catch (error: any) {
      console.error(`❌ Transaction failed - ALL deletions rolled back:`, error);
      // Transaction automatically rolled back - NO enrollments were cancelled
      return res.status(500).json({ 
        error: `Failed to cancel enrollments: ${error.message}. No enrollments were cancelled (transaction rolled back).`,
        transactionRolledBack: true
      });
    }
    
  } catch (error) {
    console.error('Error in bulk cancel operation:', error);
    res.status(500).json({ error: 'Failed to cancel enrollments' });
  }
});

// Get enrollments for a specific class
router.get('/class/:classId', async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    
    if (isNaN(classId)) {
      return res.status(400).json({ message: 'Invalid class ID' });
    }

    console.log(`📚 Fetching enrollments for class ID: ${classId}`);
    
    // Get all enrollments and filter by class ID
    const allEnrollments = await storage.getAllEnrollments();
    const classEnrollments = allEnrollments.filter((e: any) => 
      e.programId === classId || e.classId === classId
    );
    
    console.log(`📚 Found ${classEnrollments.length} enrollments for class ${classId}`);
    
    res.json(classEnrollments);
  } catch (error) {
    console.error('Error fetching class enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

export default router;