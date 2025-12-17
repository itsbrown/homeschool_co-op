import express from "express";
import { storage } from "../storage";
import { getDb } from "../db";
import { programEnrollments } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { getStripeClient } from "../config/stripe";

const router = express.Router();

// Get all enrollments for the authenticated parent (uses supabaseAuth from routes.ts)
router.get('/', async (req: any, res) => {
  try {
    // Get user from supabaseAuth middleware (req.user.email and req.user.id)
    const userEmail = req.user?.email;
    const userId = req.user?.id;
    
    if (!userEmail || !userId) {
      console.log('❌ No authenticated user found for enrollments request');
      return res.status(401).json({ message: 'Not authenticated' });
    }

    console.log(`📚 Fetching enrollments for parent: ${userEmail} (ID: ${userId})`);
    
    // Get all enrollments for this parent
    const enrollments = await storage.getProgramEnrollmentsByParent(userId);
    
    console.log(`📚 Found ${enrollments.length} enrollments for parent ${userEmail}`);
    
    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching parent enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

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
    
    // Enhance enrollments with variant details from class schedule
    const enhancedEnrollments = await Promise.all(enrollments.map(async (enrollment: any) => {
      let variantDetails = null;
      
      // If enrollment has a variantId, look up the variant from the class
      if (enrollment.variantId && enrollment.classId) {
        try {
          const classData = await storage.getClassById(enrollment.classId);
          if (classData && classData.schedule) {
            let schedule;
            try {
              schedule = typeof classData.schedule === 'string' 
                ? JSON.parse(classData.schedule) 
                : classData.schedule;
            } catch (parseErr) {
              console.log(`📚 Failed to parse schedule for class ${enrollment.classId}:`, parseErr);
              schedule = null;
            }
            
            if (schedule && schedule.variants && Array.isArray(schedule.variants)) {
              // Try multiple matching strategies with strict equality
              let variant = null;
              const variantIdStr = String(enrollment.variantId);
              
              // Strategy 1: Match by id field (strict string equality)
              variant = schedule.variants.find((v: any) => String(v.id) === variantIdStr);
              
              // Strategy 2: Match by name (strict equality)
              if (!variant) {
                variant = schedule.variants.find((v: any) => v.name === enrollment.variantId);
              }
              
              // Strategy 3: Match by pure numeric index ONLY if variantId is purely numeric
              // (reject strings like "0abc" or UUIDs starting with digits)
              if (!variant) {
                const isStrictlyNumeric = /^\d+$/.test(variantIdStr);
                if (isStrictlyNumeric) {
                  const idx = parseInt(variantIdStr, 10);
                  if (idx >= 0 && idx < schedule.variants.length) {
                    variant = schedule.variants[idx];
                  }
                }
              }
              
              if (variant) {
                variantDetails = {
                  name: variant.name || 'Schedule',
                  startTime: variant.startTime || variant.start_time || '',
                  endTime: variant.endTime || variant.end_time || '',
                  days: variant.days || variant.daysOfWeek || []
                };
              }
            }
          }
        } catch (err) {
          console.log(`📚 Could not fetch variant details for enrollment ${enrollment.id}:`, err);
        }
      }
      
      return {
        ...enrollment,
        variantDetails
      };
    }));
    
    res.json(enhancedEnrollments);
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

// Unenroll a child from a class (admin endpoint - uses database)
router.delete('/:enrollmentId', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`❌ Unenrolling enrollment ID: ${enrollmentId}`);

    // Get the enrollment from database to verify it exists
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      console.log(`❌ Enrollment ${enrollmentId} not found in database`);
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    console.log(`📝 Found enrollment to remove:`, {
      id: enrollment.id,
      childId: enrollment.childId,
      className: enrollment.className,
      status: enrollment.status
    });
    
    // Delete the enrollment from database using the correct method
    await storage.deleteProgramEnrollment(enrollmentId);
    
    console.log(`✅ Successfully unenrolled enrollment ID: ${enrollmentId}`);
    res.json({ 
      message: 'Unenrollment successful',
      deletedEnrollment: {
        id: enrollmentId,
        className: enrollment.className,
        childName: enrollment.childName
      }
    });
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
        
        console.log(`✅ Atomically deleted ${result.length} enrollments in single operation:`, result.map((r: { id: number }) => r.id));
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

// Confirm enrollments after successful payment (update status from pending_payment to enrolled)
// SECURITY: Verifies payment with Stripe before updating enrollment status
router.post('/confirm', async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    const userId = req.user?.id;
    
    if (!userEmail || !userId) {
      console.log('❌ No authenticated user found for enrollment confirmation');
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { paymentIntentId, enrollmentIds } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Payment intent ID is required' });
    }

    console.log(`🔐 Verifying payment with Stripe: ${paymentIntentId}`);
    console.log(`📧 User: ${userEmail}, Enrollment IDs:`, enrollmentIds);

    // SECURITY: Verify the payment actually succeeded with Stripe
    let stripe;
    try {
      stripe = await getStripeClient();
    } catch (stripeError) {
      console.error('❌ Failed to initialize Stripe client:', stripeError);
      return res.status(500).json({ message: 'Payment verification unavailable' });
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (retrieveError: any) {
      console.error('❌ Failed to retrieve PaymentIntent from Stripe:', retrieveError);
      return res.status(400).json({ 
        message: 'Invalid payment - could not verify with payment provider',
        error: retrieveError.message 
      });
    }

    // SECURITY: Check that the payment actually succeeded
    if (paymentIntent.status !== 'succeeded') {
      console.error(`❌ Payment not succeeded. Status: ${paymentIntent.status}`);
      return res.status(400).json({ 
        message: `Payment not confirmed. Current status: ${paymentIntent.status}`,
        paymentStatus: paymentIntent.status
      });
    }

    // SECURITY: Verify the payment email matches the authenticated user
    const paymentEmail = paymentIntent.receipt_email || paymentIntent.metadata?.parentEmail;
    if (paymentEmail && paymentEmail.toLowerCase() !== userEmail.toLowerCase()) {
      console.error(`🚨 SECURITY: Email mismatch. Payment: ${paymentEmail}, User: ${userEmail}`);
      return res.status(403).json({ 
        message: 'Unauthorized - payment does not belong to this user' 
      });
    }

    console.log(`✅ Payment verified with Stripe. Status: ${paymentIntent.status}, Amount: ${paymentIntent.amount}`);

    // Get database instance for transaction
    const db = await getDb();
    
    // Get all pending_payment enrollments for this parent
    const parentEnrollments = await storage.getProgramEnrollmentsByParent(userId);
    
    // Filter to only pending_payment enrollments
    const pendingEnrollments = parentEnrollments.filter((e: any) => 
      e.status === 'pending_payment'
    );

    if (pendingEnrollments.length === 0) {
      console.log('⚠️ No pending_payment enrollments found for user:', userEmail);
      return res.json({ 
        success: true, 
        message: 'No pending enrollments to confirm',
        confirmed: 0 
      });
    }

    // Determine which enrollments to confirm
    let enrollmentsToConfirm = pendingEnrollments;
    
    // If specific enrollment IDs provided, filter to those
    if (enrollmentIds && Array.isArray(enrollmentIds) && enrollmentIds.length > 0) {
      enrollmentsToConfirm = pendingEnrollments.filter((e: any) => 
        enrollmentIds.includes(e.id)
      );
    }

    const idsToConfirm = enrollmentsToConfirm.map((e: any) => e.id);

    if (idsToConfirm.length === 0) {
      console.log('⚠️ No matching enrollments found to confirm');
      return res.json({ 
        success: true, 
        message: 'No matching enrollments to confirm',
        confirmed: 0 
      });
    }

    console.log(`📝 Confirming ${idsToConfirm.length} enrollments:`, idsToConfirm);

    // Update enrollments to 'enrolled' status
    await db.transaction(async (tx: any) => {
      const result = await tx
        .update(programEnrollments)
        .set({ 
          status: 'enrolled',
          remainingBalance: 0,
          paymentStatus: 'completed'
        })
        .where(inArray(programEnrollments.id, idsToConfirm))
        .returning({ id: programEnrollments.id });
      
      console.log(`✅ Updated ${result.length} enrollments to enrolled status`);
    });

    console.log(`✅ Successfully confirmed ${idsToConfirm.length} enrollments for ${userEmail}`);
    
    res.json({ 
      success: true,
      message: `Successfully confirmed ${idsToConfirm.length} enrollment(s)`,
      confirmed: idsToConfirm.length,
      enrollmentIds: idsToConfirm,
      paymentIntentId,
      paymentAmount: paymentIntent.amount
    });
  } catch (error) {
    console.error('Error confirming enrollments:', error);
    res.status(500).json({ message: 'Failed to confirm enrollments' });
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